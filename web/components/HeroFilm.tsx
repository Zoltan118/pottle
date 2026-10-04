"use client";

import { useState } from "react";
import { Sheet } from "./Sheet";
import { ArrowOutIcon, PlayIcon } from "./Icons";

// the launch film on youtube: 16:9 for wide screens, the vertical cut for phones, and the walkthrough of
// the real app for anyone who wants more. public video ids, nothing private
const FILM = { wide: "4Apt3sdMQ0g", tall: "ZfevNxJnms8", length: "1:28" };
const WALKTHROUGH = "https://youtu.be/wGe5bo1vvrg";

// youtube's privacy mode: no cookies until someone presses play. the player only exists while the sheet
// is open, so the home page loads nothing from youtube, and closing the sheet stops the film
const embed = (id: string) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1&modestbranding=1`;

/** the play button beside "make a pot", and the sheet that plays the film */
export function HeroFilm() {
  const [open, setOpen] = useState(false);
  const [tall, setTall] = useState(false);

  function watch() {
    // decided at the tap: a phone held upright gets the vertical film, everything else the wide one
    setTall(matchMedia("(max-aspect-ratio: 4/5)").matches);
    setOpen(true);
  }

  return (
    <>
      {/* round, the height of "make a pot" beside it: the play shape says what it does, so it fits next to
          two big buttons on the live site without wrapping */}
      <button className="btn lg ghost watch" onClick={watch} aria-label={`watch the film, ${FILM.length}`} data-tip={`watch the film · ${FILM.length}`}>
        <PlayIcon />
        {/* on hover or press the triangle gives way to a tiny pottle that fills up (see .watch-pot in the css) */}
        <svg className="watch-pot" viewBox="0 0 96 96" aria-hidden="true">
          <defs><clipPath id="watch-pot-clip"><circle cx="48" cy="57" r="23" /></clipPath></defs>
          <rect x="17" y="17" width="62" height="12" rx="6" fill="currentColor" />
          <g clipPath="url(#watch-pot-clip)"><rect className="watch-fill" x="20" y="34" width="56" height="56" /></g>
          <circle cx="48" cy="57" r="27" fill="none" stroke="currentColor" strokeWidth="8" />
        </svg>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} label="the pottle film" className={`film${tall ? " tall" : ""}`}>
        <p className="film-title">pottle, in {FILM.length}</p>
        <div className="film-frame">
          {open && (
            <iframe src={embed(tall ? FILM.tall : FILM.wide)} title="the pottle film"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
          )}
        </div>
        <a className="film-more" href={WALKTHROUGH} target="_blank" rel="noreferrer">see the full walkthrough of the real app<ArrowOutIcon /></a>
      </Sheet>
    </>
  );
}
