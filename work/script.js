(function () {
	'use strict';

	var deck = document.querySelector('.deck');
	var menu = document.querySelector('.menu');
	var toggle = document.querySelector('.menu-toggle');
	var closeBtn = document.querySelector('.menu__close');

	/* Project sections are positioned, so offsetTop on a visual is measured
	   against its section rather than the scroller. Measure against the deck. */
	function offsetInDeck(el) {
		return deck.scrollTop + el.getBoundingClientRect().top - deck.getBoundingClientRect().top;
	}

	function smooth() {
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
	}

	function goTo(el) {
		/* Skip past anything that is not rendered — the logo band is hidden on
		   mobile, and both the skip link and the hero's scroll cue point at it,
		   so without this they would scroll nowhere. */
		while (el && !el.getBoundingClientRect().height) el = el.nextElementSibling;
		if (!el) return;
		/* Below 900px the deck is a normal document flow, not a scroller. */
		if (window.matchMedia('(max-width: 900px)').matches) {
			el.scrollIntoView({ behavior: smooth(), block: 'start' });
			return;
		}
		deck.scrollTo({ top: offsetInDeck(el), behavior: smooth() });
	}

	/* ------------------------------------------------------------- menu */

	function setMenu(open) {
		if (!menu) return;
		menu.setAttribute('data-open', open ? 'true' : 'false');
		if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
		if (open) {
			var first = menu.querySelector('.menu__link');
			if (first) first.focus({ preventScroll: true });
		} else if (toggle) {
			toggle.focus({ preventScroll: true });
		}
	}

	if (toggle) {
		toggle.addEventListener('click', function () {
			setMenu(menu.getAttribute('data-open') !== 'true');
		});
	}
	if (closeBtn) closeBtn.addEventListener('click', function () { setMenu(false); });
	if (menu) {
		menu.addEventListener('click', function (e) {
			if (e.target === menu) setMenu(false);
		});
		menu.addEventListener('keydown', function (e) {
			if (e.key === 'Tab' && menu.getAttribute('data-open') === 'true') {
				var items = menu.querySelectorAll('button, a[href]');
				if (!items.length) return;
				var first = items[0];
				var last = items[items.length - 1];
				if (e.shiftKey && document.activeElement === first) {
					e.preventDefault();
					last.focus();
				} else if (!e.shiftKey && document.activeElement === last) {
					e.preventDefault();
					first.focus();
				}
			}
		});
	}

	/* Menu links target sections inside the scrolling deck, so let the deck
	   do the scrolling rather than the document. */
	Array.prototype.forEach.call(document.querySelectorAll('a[href^="#"]'), function (link) {
		link.addEventListener('click', function (e) {
			var id = link.getAttribute('href').slice(1);
			var target = id && document.getElementById(id);
			if (!target || !deck) return;
			e.preventDefault();
			setMenu(false);
			goTo(target);
			if (history.replaceState) history.replaceState(null, '', '#' + id);
		});
	});

	document.addEventListener('keydown', function (e) {
		if (e.key === 'Escape' && menu && menu.getAttribute('data-open') === 'true') {
			setMenu(false);
		}
	});

	/* ------------------------------------------------- progress rail spy */

	/* Direction of travel, so the rail's pill can expand the way the reader is
	   moving. Only one of the two scrollers is ever active (the deck above
	   900px, the document below), so summing them reads whichever applies. */
	var scrollDir = 'down';
	var lastScrollPos = 0;

	function trackDir() {
		var pos = (deck ? deck.scrollTop : 0) + (window.scrollY || 0);
		if (pos > lastScrollPos) scrollDir = 'down';
		else if (pos < lastScrollPos) scrollDir = 'up';
		lastScrollPos = pos;
	}

	if (deck) deck.addEventListener('scroll', trackDir, { passive: true });
	window.addEventListener('scroll', trackDir, { passive: true });

	var rail = document.querySelector('.rail');
	var stops = [].slice.call(document.querySelectorAll('[data-stop]'));

	if (rail && stops.length && 'IntersectionObserver' in window) {
		/* Idempotent: if this ever runs twice the dots are rebuilt rather than
		   appended, so the rail cannot end up doubled. */
		rail.textContent = '';
		var dots = {};
		stops.forEach(function (stop) {
			var id = stop.id;
			var dot = document.createElement('a');
			dot.href = '#' + id;
			dot.setAttribute('aria-label', stop.getAttribute('data-stop'));
			rail.appendChild(dot);
			dots[id] = dot;
		});

		/* Re-bind: the dots were created after the anchor handler above ran. */
		Array.prototype.forEach.call(rail.querySelectorAll('a'), function (link) {
			link.addEventListener('click', function (e) {
				var target = document.getElementById(link.getAttribute('href').slice(1));
				if (!target || !deck) return;
				e.preventDefault();
				goTo(target);
			});
		});

		var observer = new IntersectionObserver(
			function (entries) {
				entries.forEach(function (entry) {
					var dot = dots[entry.target.id];
					if (!dot) return;
					if (entry.isIntersecting) {
						Object.keys(dots).forEach(function (k) {
							dots[k].setAttribute('aria-current', 'false');
						});
						dot.setAttribute('aria-current', 'true');
						/* Read the direction once, at activation. Tracking it
						   continuously would re-anchor the pill mid-slide the
						   moment the reader reversed, making it jump. */
						dot.setAttribute('data-grow', scrollDir);
					}
				});
			},
			{ root: deck, threshold: 0.5 }
		);
		stops.forEach(function (stop) { observer.observe(stop); });
	}

	/* ----------------------------------------------------- slide reveal */

	/* Snapping straight to a finished frame reads as abrupt, so each slide's
	   content eases in as it arrives. The hero and the logo strip are left
	   out: those are already driven continuously by the crossfade below.
	   Direct children only — a device nested inside a composite reveals with
	   the composite, and the reveal's `transform: none` would otherwise wipe
	   out the transform positioning it on the base image. */
	var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	var revealTargets = [].slice.call(
		document.querySelectorAll('.project__info, .project__visual > img, .project__visual > .device, .project__visual > .composite, .project__visual > .stage, .outro__inner')
	);

	if (revealTargets.length && 'IntersectionObserver' in window && !reduceMotion) {
		document.documentElement.classList.add('js-reveal');
		revealTargets.forEach(function (el) { el.classList.add('reveal'); });

		/* Viewport-rooted deliberately: the deck fills the viewport when it is
		   the scroller, so this works there and in normal document flow below
		   900px without swapping roots on resize. */
		var revealObserver = new IntersectionObserver(
			function (entries) {
				entries.forEach(function (entry) {
					if (!entry.isIntersecting) return;
					entry.target.classList.add('is-in');
					revealObserver.unobserve(entry.target);
				});
			},
			{ threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
		);
		revealTargets.forEach(function (el) { revealObserver.observe(el); });
	}

	/* --------------------------------------------------- device playback */

	/* Autoplaying every clip at once would keep several decoders alive for
	   slides nobody is looking at, which costs battery on phones. Each one is
	   loaded and played only while it is on screen, and paused when it leaves.
	   Under reduced motion nothing plays and the poster frame stands in. */
	/* Qualified to video: the two-up stage puts stills in .device__screen too,
	   and play() on an <img> would throw and take the callback down with it. */
	var screens = [].slice.call(document.querySelectorAll('video.device__screen, video.composite__overlay'));

	if (screens.length && 'IntersectionObserver' in window && !reduceMotion) {
		var playObserver = new IntersectionObserver(
			function (entries) {
				entries.forEach(function (entry) {
					var v = entry.target;
					if (entry.isIntersecting) {
						/* preload is "none" in the markup, so the source is
						   only fetched once a slide is actually approached. */
						if (v.preload !== 'auto') v.preload = 'auto';
						var p = v.play();
						if (p && p.catch) p.catch(function () {});
					} else if (!v.paused) {
						v.pause();
					}
				});
			},
			{ threshold: 0.25 }
		);
		screens.forEach(function (v) { playObserver.observe(v); });
	}

	/* Paired stills on the two-up stage dissolve between each other on a loop.
	   Same treatment as the clips above — it runs only while the slide is on
	   screen, and not at all under reduced motion. Kept observed rather than
	   unobserved on first sight, so leaving the slide stops the animation.

	   The stage is watched, not the two frames inside it. Observing each frame
	   started them up to 80ms apart, because a taller frame crosses the
	   threshold before a shorter one, and re-entry would restart one of them
	   alone. One element means one start, so the pair cannot drift. */
	var dissolveGroups = [].slice.call(document.querySelectorAll('.stage'));

	if (dissolveGroups.length && 'IntersectionObserver' in window && !reduceMotion) {
		var dissolveObserver = new IntersectionObserver(
			function (entries) {
				entries.forEach(function (entry) {
					entry.target.classList.toggle('is-playing', entry.isIntersecting);
				});
			},
			{ threshold: 0.25 }
		);
		dissolveGroups.forEach(function (el) { dissolveObserver.observe(el); });
	}

	/* ------------------------------------------- hero copy / cue alignment */

	/* The hero copy is left-aligned to the scroll cue. The cue is centred in
	   the viewport, so its left edge is 50% minus half its own width, and
	   that width moves with the clamped chrome font size. Measuring keeps the
	   two flush at every viewport instead of approximating it in CSS. */
	var cueEl = document.querySelector('.hero__scroll');
	var copyEl = document.querySelector('.hero__copy');

	function alignHeroCopy() {
		if (!cueEl || !copyEl) return;
		/* Below 900px the copy is full-width and the cue is hidden, so leave
		   the stylesheet's own rule to it. */
		if (window.matchMedia('(max-width: 900px)').matches) {
			document.documentElement.style.removeProperty('--hero-copy-left');
			return;
		}
		var r = cueEl.getBoundingClientRect();
		if (!r.width) return;
		document.documentElement.style.setProperty('--hero-copy-left', Math.round(r.left) + 'px');
	}

	alignHeroCopy();
	window.addEventListener('resize', alignHeroCopy);
	/* Re-measure once the webfont lands: the cue's width changes with it. */
	if (document.fonts && document.fonts.ready) document.fonts.ready.then(alignHeroCopy);

	/* ------------------------------------------- hero -> clients crossfade */

	/* Both slides are essentially black, so a hard snap between them reads as
	   a jump. Tying the hero photograph's fade-out and the logo strip's
	   fade-in to scroll position turns it into a dissolve that tracks the
	   scroll rather than running on a fixed timer. */
	var clientsSection = document.getElementById('clients');
	var heroPhoto = document.querySelector('.hero__photo');
	var heroCopy = document.querySelector('.hero__copy');
	var heroScroll = document.querySelector('.hero__scroll');
	var clientsStrip = document.querySelector('.clients__row');

	if (clientsSection && clientsStrip &&
		!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
		var ticking = false;

		/* Sequential, not a cross-dissolve: slide 1 fades to black first, the
		   screen holds black briefly, then the logos come up. The hero's own
		   background is near-black, so once its photo and copy reach 0 the whole
		   frame is black regardless of how far the next section has scrolled in.
		   Fractions are of the scroll between the two slides. */
		/* 1.0, not less: at 0.8 the value clamped for the first 20% of the
		   scroll either side of slide 2, so leaving it did nothing at all and
		   then lurched into the fade. Spanning the full scroll means any
		   movement away from the slide starts changing opacity immediately. */
		var SEQ_SPAN = 1.0;    /* whole sequence spans the scroll between slides */
		var OUT_END = 0.42;    /* hero is fully black by here */
		var IN_START = 0.54;   /* logos start after the black hold */
		/* Spans the whole exit, so the fade tracks the scroll the entire way
		   out with no dead stretch. Safe at 1.0 because the strip is released
		   below (it leaves with its own section, so it stays over that
		   section's black rather than drifting onto the light slide). */
		var OUT_SPAN = 1;      /* logos fade out over this much of the exit */

		/* Smootherstep: zero first and second derivative at both ends, so a
		   fade eases in and out of motion instead of starting or stopping
		   abruptly. The previous pow(t, 0.7) had near-vertical slope at t=0,
		   which showed as a visible jump the instant any fade began — most
		   obvious leaving the logos, where opacity dropped from 1 to 0.79 in
		   a single scroll step. */
		function phase(v, from, to) {
			var t = (v - from) / (to - from);
			t = t < 0 ? 0 : t > 1 ? 1 : t;
			return t * t * t * (t * (t * 6 - 15) + 10);
		}

		function crossfade() {
			ticking = false;
			var vh = window.innerHeight;
			if (!vh) return;
			/* Viewport-relative, so this works whether the deck is the
			   scroller (desktop) or the document is (below 900px). */
			/* Whichever slide actually follows the hero. The logo band is hidden
			   on mobile, where its rect reads all zeros — taking that at face
			   value would read as the next slide having fully arrived and fade
			   the hero out on load, and since the photograph is viewport-fixed
			   it would then sit over the whole page. Falling through to the
			   first project keeps the hero's fade tied to whatever is really
			   coming up behind it. */
			var ref = clientsSection;
			while (ref && !ref.getBoundingClientRect().height) ref = ref.nextElementSibling;
			if (!ref) return;
			var top = ref.getBoundingClientRect().top;
			var q = (1 - top / vh) / SEQ_SPAN;
			q = q < 0 ? 0 : q > 1 ? 1 : q;

			var heroOut = 1 - phase(q, 0, OUT_END);
			var logosIn = phase(q, IN_START, 1);
			/* Departure, 0..1 as the section clears the top of the viewport.
			   Without this the logos rode up off-screen at full opacity. */
			var exit = -top / vh;
			exit = exit < 0 ? 0 : exit > 1 ? 1 : exit;
			var logosOut = phase(exit, 0, OUT_SPAN);

			if (heroPhoto) heroPhoto.style.opacity = heroOut.toFixed(3);
			if (heroCopy) heroCopy.style.opacity = heroOut.toFixed(3);
			if (heroScroll) {
				heroScroll.style.opacity = heroOut.toFixed(3);
				/* Fixed and full-time in the layout now, so it would keep
				   catching clicks at the bottom of every later slide once
				   it has faded out. */
				heroScroll.style.pointerEvents = heroOut < 0.05 ? 'none' : '';
			}

			/* Nothing to fade when the band is not rendered. */
			if (ref !== clientsSection) return;

			clientsStrip.style.opacity = (logosIn * (1 - logosOut)).toFixed(3);
			/* Hold the strip at the viewport centre for the whole approach and
			   departure, so it fades in and back out in place instead of
			   travelling with its section in either direction. */
			/* Held still on the way in, so the logos resolve in place rather
			   than riding up from below. Released on the way out (hold 0 once
			   top passes 0, continuous across the boundary) so they leave with
			   their own section and stay over its black throughout. */
			var hold = top > 0 ? (top > vh ? vh : top) : 0;
			clientsStrip.style.transform = 'translateY(' + (-hold).toFixed(1) + 'px)';
		}

		function onScroll() {
			if (ticking) return;
			ticking = true;
			window.requestAnimationFrame(crossfade);
		}

		if (deck) deck.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onScroll);
		crossfade();
	}

	/* ------------------------------------------------- chrome on dark/light */

	/* The header sits over two kinds of slide and has to stay legible on both.
	   .hero and .clients are #000; every project slide is the light body. So
	   this is not a gradient to sample, it is a boundary to find: the chrome is
	   light until the last black panel's bottom edge passes its midline, and
	   dark after.

	   Geometry rather than the rail's active-stop observer, because that fires
	   at a 0.5 threshold — half a slide away from where the background actually
	   changes behind the header. Rects are viewport-relative, so this holds
	   whether the deck is the scroller or the document is. */
	var chrome = document.querySelector('.chrome');
	/* Both of these are #000. The logo band is the last of them on desktop; on
	   mobile it is hidden and the hero is. Listed darkest-last and read in
	   reverse, so whichever is really on the page decides the boundary — a
	   hidden element's rect is all zeros, and taking that as the edge put the
	   header in dark ink over the black hero. */
	var darkPanels = [document.getElementById('intro'), document.getElementById('clients')];

	if (chrome && darkPanels[0]) {
		var chromeTicking = false;

		function paintChrome() {
			chromeTicking = false;
			var box = chrome.getBoundingClientRect();
			var mid = box.top + box.height / 2;
			var edge = 0;
			darkPanels.forEach(function (panel) {
				if (!panel) return;
				var rect = panel.getBoundingClientRect();
				if (rect.height && rect.bottom > edge) edge = rect.bottom;
			});
			chrome.setAttribute('data-bg', edge > mid ? 'dark' : 'light');
		}

		function onChromeScroll() {
			if (chromeTicking) return;
			chromeTicking = true;
			window.requestAnimationFrame(paintChrome);
		}

		if (deck) deck.addEventListener('scroll', onChromeScroll, { passive: true });
		window.addEventListener('scroll', onChromeScroll, { passive: true });
		window.addEventListener('resize', onChromeScroll);
		paintChrome();
	}

	/* --------------------------------------------------- keyboard paging */

	if (deck) {
		var panels = [].slice.call(deck.querySelectorAll('.panel, .project__visual'));
		document.addEventListener('keydown', function (e) {
			if (menu && menu.getAttribute('data-open') === 'true') return;
			var tag = (document.activeElement && document.activeElement.tagName) || '';
			if (tag === 'INPUT' || tag === 'TEXTAREA') return;

			var dir = 0;
			if (e.key === 'ArrowDown' || e.key === 'PageDown') dir = 1;
			if (e.key === 'ArrowUp' || e.key === 'PageUp') dir = -1;
			if (!dir) return;
			if (window.matchMedia('(max-width: 900px)').matches) return;

			e.preventDefault();
			var here = deck.scrollTop;
			var next = null;
			for (var i = 0; i < panels.length; i++) {
				var top = offsetInDeck(panels[i]);
				if (dir > 0 && top > here + 4) { next = top; break; }
				if (dir < 0 && top < here - 4) { next = top; }
			}
			if (next === null) return;
			deck.scrollTo({ top: next, behavior: smooth() });
		});
	}
})();
