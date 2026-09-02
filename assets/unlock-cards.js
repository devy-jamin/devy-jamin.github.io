/*
 * Inline unlock for the password-protected case studies.
 *
 * Two entry points, one behaviour:
 *   - the project cards on the homepage reveal the form over the artwork
 *   - any other link to a locked page (the "next project" arrow in the footer)
 *     opens the same form as a centred dialog
 *
 * On success we store the password under the key the locked page already looks
 * for (sessionStorage 'dj-unlock-<path>') and navigate, so the page unlocks
 * itself on arrival with no second prompt.
 */
(function () {
	'use strict';

	var LOCKED = ['/nike-artemis/', '/nike-launch-admin/'];
	if (!window.crypto || !crypto.subtle) return;      // needs a secure context

	var LOCK_SVG =
		'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
			'<path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" ' +
				'stroke-width="2" stroke-linecap="round"/>' +
			'<rect x="4" y="10" width="16" height="10" rx="2" fill="currentColor"/>' +
		'</svg>';

	var ARROW_SVG =
		'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
			'<path d="M5 12h13M12 5l7 7-7 7" fill="none" stroke="currentColor" ' +
				'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
		'</svg>';

	function panelHTML() {
		return '<div class="dj-lock-inner">' +
				'<span class="dj-lock-icon">' + LOCK_SVG + '</span>' +
				'<p class="dj-lock-label">Password protected</p>' +
				'<form class="dj-lock-form">' +
					'<input type="password" class="dj-lock-input" placeholder="Password" ' +
						'aria-label="Password" autocomplete="current-password" required />' +
					'<button type="submit" class="dj-lock-btn" aria-label="View case study">' +
						ARROW_SVG +
					'</button>' +
				'</form>' +
				'<p class="dj-lock-msg" role="status" aria-live="polite"></p>' +
			'</div>';
	}

	function bytes(b64) {
		var s = atob(b64), a = new Uint8Array(s.length);
		for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
		return a;
	}

	function field(text, name) {
		var m = new RegExp(name + ' = "([^"]*)"').exec(text);
		return m ? m[1] : null;
	}

	// Decrypt the target page's payload to confirm the password is right.
	async function verify(path, pw) {
		// no-store matters: each lock.py run writes a new salt, so a cached copy
		// of this page would have us check a correct password against stale
		// ciphertext and call it wrong.
		var html = await (await fetch(path, {
			credentials: 'same-origin',
			cache: 'no-store'
		})).text();
		var salt = field(html, 'SALT'), iv = field(html, 'IV'), ct = field(html, 'CT');
		var iter = /ITER = (\d+)/.exec(html);
		if (!salt || !iv || !ct || !iter) throw new Error('not a locked page');
		var base = await crypto.subtle.importKey(
			'raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
		var key = await crypto.subtle.deriveKey(
			{ name: 'PBKDF2', salt: bytes(salt), iterations: +iter[1], hash: 'SHA-256' },
			base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
		await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: bytes(iv) }, key, bytes(ct));    // throws if wrong
		return true;
	}

	// Wire a panel's form up to verify -> store -> navigate.
	function wireForm(root, path) {
		var form = root.querySelector('.dj-lock-form');
		var input = root.querySelector('.dj-lock-input');
		var btn = root.querySelector('.dj-lock-btn');
		var msg = root.querySelector('.dj-lock-msg');

		form.addEventListener('submit', async function (e) {
			e.preventDefault();
			if (!input.value) return;
			btn.disabled = true;
			msg.className = 'dj-lock-msg';
			msg.textContent = 'Checking…';
			try {
				await verify(path, input.value);
				try { sessionStorage.setItem('dj-unlock-' + path, input.value); } catch (err) {}
				msg.textContent = 'Opening…';
				location.href = path;
			} catch (err) {
				msg.className = 'dj-lock-msg dj-lock-err';
				msg.textContent = 'That password didn’t work.';
				btn.disabled = false;
				input.select();
			}
		});
		return { input: input, msg: msg, btn: btn };
	}

	function unlockedAlready(path) {
		try { return !!sessionStorage.getItem('dj-unlock-' + path); } catch (e) { return false; }
	}

	/* ---- homepage card: form revealed over the artwork -------------------- */
	function enhanceCard(figure, path) {
		if (unlockedAlready(path)) {
			figure.classList.add('dj-card-unlocked');
			return;
		}
		figure.classList.add('dj-locked-card');

		var overlay = document.createElement('div');
		overlay.className = 'dj-lock-overlay';
		overlay.innerHTML = panelHTML();
		figure.appendChild(overlay);

		var badge = document.createElement('div');
		badge.className = 'dj-lock-badge';
		badge.innerHTML = LOCK_SVG + '<span class="dj-sr-only">Password protected</span>';
		figure.appendChild(badge);

		var parts = wireForm(overlay, path);

		function open() {
			figure.classList.add('dj-open');
			requestAnimationFrame(function () {
				requestAnimationFrame(function () { parts.input.focus(); });
			});
		}
		function close() {
			figure.classList.remove('dj-open');
			parts.msg.textContent = '';
			parts.msg.className = 'dj-lock-msg';
			parts.input.value = '';
		}

		var link = figure.querySelector('a[href="' + path + '"]');
		if (link) {
			link.addEventListener('click', function (e) { e.preventDefault(); open(); });
		}
		document.addEventListener('click', function (e) {
			if (figure.classList.contains('dj-open') && !figure.contains(e.target)) close();
		});
		document.addEventListener('keydown', function (e) {
			if (e.key === 'Escape' && figure.classList.contains('dj-open')) {
				close();
				if (link) link.focus();
			}
		});
	}

	/* ---- any other link (e.g. the footer arrow): centred dialog ----------- */
	var dialogs = {};

	function dialogFor(path) {
		if (dialogs[path]) return dialogs[path];

		var dlg = document.createElement('div');
		dlg.className = 'dj-lock-dialog';
		dlg.setAttribute('role', 'dialog');
		dlg.setAttribute('aria-modal', 'true');
		dlg.setAttribute('aria-label', 'Password required');
		dlg.innerHTML = '<div class="dj-lock-panel">' + panelHTML() +
			'<button type="button" class="dj-lock-close" aria-label="Close">&times;</button></div>';
		document.body.appendChild(dlg);

		var parts = wireForm(dlg, path);
		var opener = null;

		function close() {
			dlg.classList.remove('dj-open');
			parts.msg.textContent = '';
			parts.msg.className = 'dj-lock-msg';
			parts.input.value = '';
			if (opener) opener.focus();
		}
		dlg.addEventListener('click', function (e) {
			// only a click on the scrim itself closes it, not inside the panel
			if (e.target === dlg) close();
		});
		dlg.querySelector('.dj-lock-close').addEventListener('click', close);
		document.addEventListener('keydown', function (e) {
			if (e.key === 'Escape' && dlg.classList.contains('dj-open')) close();
		});

		dialogs[path] = {
			open: function (from) {
				opener = from || null;
				dlg.classList.add('dj-open');
				requestAnimationFrame(function () {
					requestAnimationFrame(function () { parts.input.focus(); });
				});
			}
		};
		return dialogs[path];
	}

	function enhanceLink(link, path) {
		if (unlockedAlready(path)) return;           // already open; let it navigate
		link.classList.add('dj-locked-link');
		link.addEventListener('click', function (e) {
			e.preventDefault();
			dialogFor(path).open(link);
		});
	}

	function init() {
		LOCKED.forEach(function (path) {
			var links = document.querySelectorAll('a[href="' + path + '"]');
			Array.prototype.forEach.call(links, function (link) {
				var figure = link.closest('figure');
				if (figure && figure.querySelector('img')) {
					if (!figure.classList.contains('dj-locked-card') &&
						!figure.classList.contains('dj-card-unlocked')) {
						enhanceCard(figure, path);
					}
				} else {
					enhanceLink(link, path);
				}
			});
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
