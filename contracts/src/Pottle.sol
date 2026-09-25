// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice The slice of Circle's FiatToken (USDC, EURC) that Pottle uses.
interface IFiatToken {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

/// @title Pottle
/// @notice Group pots for gifts and shared costs, in dollars (USDC) or euros (EURC). Money sits here until the goal is hit
/// (then it goes to the organiser) or the deadline passes without hitting it (then everyone
/// gets their own money back). Nobody, including the organiser and the deployer, can move
/// funds any other way. There is no owner and no fee.
/// @dev Titles and names live in storage so a page can render a pot from one call, with no
/// indexer. On Arc that costs a fraction of a cent.
contract Pottle {
    IFiatToken public immutable usdc;
    IFiatToken public immutable eurc;

    uint256 public constant MAX_DURATION = 90 days;
    uint256 public constant MAX_GOAL = 10_000e6; // 10,000 of the pot's currency, both tokens have 6 decimals
    uint256 public constant MIN_CHIP = 1e4; // $0.01
    uint256 public constant MAX_TITLE = 64; // bytes
    uint256 public constant MAX_NAME = 24; // bytes
    uint256 public constant MAX_PEOPLE = 100; // per pot, bounds refundAll
    uint8 public constant MAX_WRAP = 7;
    /// @notice if a pot hit its goal but still has not paid out this long after its deadline (for
    /// example because the organiser's address was blocklisted by the token issuer), contributors may
    /// take their money back. long enough to outlast a temporary freeze that gets reviewed and lifted.
    uint256 public constant PAYOUT_GRACE = 30 days;

    struct Pot {
        address organiser;
        uint64 deadline;
        bool released;
        uint128 goal;
        uint128 raised; // currently held for this pot, falls as refunds go out
        uint8 wrap; // the look the organiser picked, 0 to MAX_WRAP
        uint8 currency; // 0 = usdc, 1 = eurc
        string title;
        string organiserName;
    }

    enum Status {
        None,
        Open, // taking money
        Reached, // goal hit, waiting for anyone to call release
        Released, // paid out to the organiser
        Refunding // deadline passed below goal, contributors can take their money back
    }

    uint256 public potCount;
    mapping(uint256 => Pot) internal _pots;
    mapping(uint256 => address[]) internal _people;
    mapping(uint256 => mapping(address => bool)) public joined;
    mapping(uint256 => mapping(address => string)) public nameOf;
    mapping(uint256 => mapping(address => uint256)) public chipped;
    mapping(address => uint256[]) internal _potsOf; // pots someone made or joined, oldest first

    uint256 private locked = 1;

    event PotCreated(uint256 indexed id, address indexed organiser, uint256 goal, uint256 deadline, string title);
    event ChippedIn(uint256 indexed id, address indexed from, uint256 amount, string name);
    event Released(uint256 indexed id, address indexed organiser, uint256 amount);
    event Refunded(uint256 indexed id, address indexed to, uint256 amount);
    event RefundFailed(uint256 indexed id, address indexed to, uint256 amount);

    error BadGoal();
    error BadDeadline();
    error BadText();
    error NoSuchPot();
    error PotClosed();
    error PotFull();
    error TooSmall();
    error GoalNotReached();
    error NotRefunding();
    error NothingToRefund();
    error TransferFailed();
    error Reentrancy();

    modifier nonReentrant() {
        if (locked != 1) revert Reentrancy();
        locked = 2;
        _;
        locked = 1;
    }

    constructor(IFiatToken _usdc, IFiatToken _eurc) {
        require(address(_usdc) != address(0) && address(_eurc) != address(0), "token address");
        usdc = _usdc;
        eurc = _eurc;
    }

    /// @notice The token a pot is paid in.
    function tokenOf(uint256 id) public view returns (IFiatToken) {
        return _pots[id].currency == 1 ? eurc : usdc;
    }

    // ---------------------------------------------------------------- create

    function create(uint128 goal, uint64 deadline, uint8 wrap, uint8 currency, string calldata title, string calldata organiserName)
        external
        nonReentrant
        returns (uint256 id)
    {
        if (goal == 0 || goal > MAX_GOAL) revert BadGoal();
        if (wrap > MAX_WRAP || currency > 1) revert BadText();
        if (deadline <= block.timestamp || deadline > block.timestamp + MAX_DURATION) revert BadDeadline();
        _text(title, MAX_TITLE);
        _text(organiserName, MAX_NAME);

        id = ++potCount;
        _pots[id] = Pot({
            organiser: msg.sender,
            deadline: deadline,
            released: false,
            goal: goal,
            raised: 0,
            wrap: wrap,
            currency: currency,
            title: title,
            organiserName: organiserName
        });
        _potsOf[msg.sender].push(id);
        emit PotCreated(id, msg.sender, goal, deadline, title);
    }

    // ---------------------------------------------------------------- chip in

    /// @notice Chip in after approving this contract to spend your USDC.
    function chipIn(uint256 id, uint128 amount, string calldata name) external nonReentrant {
        _record(id, msg.sender, amount, name);
        if (!tokenOf(id).transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
    }

    /// @notice Chip in with one signature (EIP-3009). Anyone can submit it, so the fee can be
    /// sponsored. The signed nonce commits to the pot, the name and a salt, so a submitter
    /// cannot redirect the money to another pot or change the name shown for it.
    function chipInWithAuthorization(
        uint256 id,
        address from,
        uint128 amount,
        string calldata name,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 salt,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        _record(id, from, amount, name);
        bytes32 nonce = authNonce(id, name, salt);
        tokenOf(id).receiveWithAuthorization(from, address(this), amount, validAfter, validBefore, nonce, v, r, s);
    }

    /// @notice The EIP-3009 nonce a contributor signs for a given pot and name.
    function authNonce(uint256 id, string calldata name, bytes32 salt) public pure returns (bytes32) {
        return keccak256(abi.encode(id, keccak256(bytes(name)), salt));
    }

    function _record(uint256 id, address from, uint128 amount, string calldata name) private {
        Pot storage p = _pots[id];
        if (p.organiser == address(0)) revert NoSuchPot();
        if (p.released || block.timestamp >= p.deadline) revert PotClosed();
        if (amount < MIN_CHIP) revert TooSmall();
        _text(name, MAX_NAME);

        if (!joined[id][from]) {
            if (_people[id].length >= MAX_PEOPLE) revert PotFull();
            joined[id][from] = true;
            _people[id].push(from);
            if (from != p.organiser) _potsOf[from].push(id);
        }
        nameOf[id][from] = name;
        p.raised += amount;
        chipped[id][from] += amount;
        emit ChippedIn(id, from, amount, name);
    }

    // ---------------------------------------------------------------- pay out

    /// @notice Send the pot to its organiser once the goal is hit. Anyone can call this,
    /// before or after the deadline.
    function release(uint256 id) external nonReentrant {
        Pot storage p = _pots[id];
        if (p.organiser == address(0)) revert NoSuchPot();
        if (p.released) revert PotClosed();
        if (p.raised < p.goal) revert GoalNotReached();

        p.released = true;
        uint256 amount = p.raised;
        if (!tokenOf(id).transfer(p.organiser, amount)) revert TransferFailed();
        emit Released(id, p.organiser, amount);
    }

    // ---------------------------------------------------------------- refunds

    /// @notice Take your own money back from a pot that missed its goal.
    function claimRefund(uint256 id) external nonReentrant {
        Pot storage p = _pots[id];
        if (!_refunding(p)) revert NotRefunding();
        uint256 amount = chipped[id][msg.sender];
        if (amount == 0) revert NothingToRefund();

        chipped[id][msg.sender] = 0;
        p.raised -= uint128(amount);
        if (!tokenOf(id).transfer(msg.sender, amount)) revert TransferFailed();
        emit Refunded(id, msg.sender, amount);
    }

    /// @notice Refund everyone in a pot that missed its goal. Anyone can call this; it is how
    /// the app makes refunds automatic. A contributor whose transfer fails is skipped and
    /// keeps their balance, so they can still claim it themselves.
    function refundAll(uint256 id) external nonReentrant {
        Pot storage p = _pots[id];
        if (!_refunding(p)) revert NotRefunding();

        IFiatToken token = tokenOf(id);
        address[] storage people = _people[id];
        for (uint256 i; i < people.length; ++i) {
            address to = people[i];
            uint256 amount = chipped[id][to];
            if (amount == 0) continue;

            chipped[id][to] = 0;
            p.raised -= uint128(amount);
            bool ok = false;
            try token.transfer(to, amount) returns (bool sent) {
                ok = sent;
            } catch {}
            if (ok) {
                emit Refunded(id, to, amount);
            } else {
                chipped[id][to] = amount;
                p.raised += uint128(amount);
                emit RefundFailed(id, to, amount);
            }
        }
    }

    // ---------------------------------------------------------------- views

    function statusOf(uint256 id) public view returns (Status) {
        Pot storage p = _pots[id];
        if (p.organiser == address(0)) return Status.None;
        if (p.released) return Status.Released;
        if (p.raised >= p.goal) return Status.Reached;
        if (block.timestamp >= p.deadline) return Status.Refunding;
        return Status.Open;
    }

    /// @notice Everything a pot page needs, in one call.
    function getPot(uint256 id)
        external
        view
        returns (
            Pot memory pot,
            Status status,
            address[] memory people,
            string[] memory names,
            uint256[] memory amounts
        )
    {
        pot = _pots[id];
        status = statusOf(id);
        people = _people[id];
        names = new string[](people.length);
        amounts = new uint256[](people.length);
        for (uint256 i; i < people.length; ++i) {
            names[i] = nameOf[id][people[i]];
            amounts[i] = chipped[id][people[i]];
        }
    }

    /// @notice Every pot this address made or chipped into, oldest first.
    function potsOf(address who) external view returns (uint256[] memory) {
        return _potsOf[who];
    }

    /// @dev refunds open when the deadline passes below the goal, or when a pot that hit its goal has
    /// still not paid out PAYOUT_GRACE after its deadline. release stays possible until refunds take the
    /// pot back below its goal.
    function _refunding(Pot storage p) private view returns (bool) {
        if (p.organiser == address(0) || p.released || block.timestamp < p.deadline) return false;
        return p.raised < p.goal || block.timestamp >= uint256(p.deadline) + PAYOUT_GRACE;
    }

    /// @notice true when contributors can take their money back from this pot right now.
    function refundable(uint256 id) external view returns (bool) {
        return _refunding(_pots[id]);
    }

    function _text(string calldata s, uint256 max) private pure {
        uint256 len = bytes(s).length;
        if (len == 0 || len > max) revert BadText();
    }
}
