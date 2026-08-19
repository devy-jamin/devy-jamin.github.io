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

	var rail = document.querySelector('.rail');
	var stops = [].slice.call(document.querySelectorAll('[data-stop]'));

	if (rail && stops.length && 'IntersectionObserver' in window) {
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
					}
				});
			},
			{ root: deck, threshold: 0.5 }
		);
		stops.forEach(function (stop) { observer.observe(stop); });
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
