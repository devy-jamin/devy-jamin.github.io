/*
 * Inline unlock for the password-protected case-study cards.
 *
 * Instead of sending someone to a page that then asks for a password, the card
 * itself asks. On success we stash the password under the key the locked page
 * already looks for (sessionStorage 'dj-unlock-<path>') and navigate; the page
 * unlocks itself on arrival with no second prompt.
 *
 * Verification decrypts the target page's payload here, so a wrong password is
 * reported in place rather than after a page load.
 */
(function () {
	'use strict';

	var LOCKED = ['/nike-artemis/', '/nike-launch-admin/'];
	if (!window.crypto || !crypto.subtle) return;   // needs a secure context

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
		var html = await (await fetch(path, { credentials: 'same-origin' })).text();
		var salt = field(html, 'SALT'), iv = field(html, 'IV'), ct = field(html, 'CT');
		var iter = /ITER = (\d+)/.exec(html);
		if (!salt || !iv || !ct || !iter) throw new Error('not a locked page');
		var base = await crypto.subtle.importKey(
			'raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
		var key = await crypto.subtle.deriveKey(
			{ name: 'PBKDF2', salt: bytes(salt), iterations: +iter[1], hash: 'SHA-256' },
			base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
		await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: bytes(iv) }, key, bytes(ct));   // throws if wrong
		return true;
	}

	function build(figure, path) {
		var already = false;
		try { already = !!sessionStorage.getItem('dj-unlock-' + path); } catch (e) {}
		if (already) {
			figure.classList.add('dj-card-unlocked');
			return;                       // already open this session; leave the link alone
		}

		figure.classList.add('dj-locked-card');

		var overlay = document.createElement('div');
		overlay.className = 'dj-lock-overlay';
		overlay.innerHTML =
			'<div class="dj-lock-inner">' +
				'<svg class="dj-lock-icon" viewBox="0 0 24 24" aria-hidden="true">' +
					'<path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" ' +
						'stroke-width="2" stroke-linecap="round"/>' +
					'<rect x="4" y="10" width="16" height="10" rx="2" fill="currentColor"/>' +
				'</svg>' +
				'<p class="dj-lock-label">Password protected</p>' +
				'<form class="dj-lock-form">' +
					'<input type="password" class="dj-lock-input" placeholder="Password" ' +
						'aria-label="Password" autocomplete="current-password" required />' +
					'<button type="submit" class="dj-lock-btn" aria-label="View case study">' +
						'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
							'<path d="M5 12h13M12 5l7 7-7 7" fill="none" stroke="currentColor" ' +
								'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
						'</svg>' +
					'</button>' +
				'</form>' +
				'<p class="dj-lock-msg" role="status" aria-live="polite"></p>' +
			'</div>';
		figure.appendChild(overlay);

		// A small badge so the card reads as protected before anyone clicks it.
		// The text is for screen readers; the icon carries it visually.
		var badge = document.createElement('div');
		badge.className = 'dj-lock-badge';
		badge.innerHTML =
			'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
				'<path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" ' +
					'stroke-width="2" stroke-linecap="round"/>' +
				'<rect x="4" y="10" width="16" height="10" rx="2" fill="currentColor"/>' +
			'</svg><span class="dj-sr-only">Password protected</span>';
		figure.appendChild(badge);

		var form = overlay.querySelector('.dj-lock-form');
		var input = overlay.querySelector('.dj-lock-input');
		var btn = overlay.querySelector('.dj-lock-btn');
		var msg = overlay.querySelector('.dj-lock-msg');

		// The form is revealed on click rather than sitting on the card, so the
		// artwork reads normally until someone actually wants in.
		function open() {
			figure.classList.add('dj-open');
			// the overlay is visibility:hidden until the class lands, and a
			// hidden element can't take focus - wait for it to be painted
			requestAnimationFrame(function () {
				requestAnimationFrame(function () { input.focus(); });
			});
		}
		function close() {
			figure.classList.remove('dj-open');
			msg.textContent = '';
			msg.className = 'dj-lock-msg';
			input.value = '';
		}

		var link = figure.querySelector('a[href="' + path + '"]');
		if (link) {
			link.addEventListener('click', function (e) {
				e.preventDefault();          // don't go to a page that would ask again
				open();
			});
		}

		// clicking anywhere outside this card closes it again
		document.addEventListener('click', function (e) {
			if (figure.classList.contains('dj-open') && !figure.contains(e.target)) close();
		});
		document.addEventListener('keydown', function (e) {
			if (e.key === 'Escape' && figure.classList.contains('dj-open')) {
				close();
				if (link) link.focus();
			}
		});

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
	}

	function init() {
		LOCKED.forEach(function (path) {
			var link = document.querySelector('figure a[href="' + path + '"]');
			if (link) build(link.closest('figure'), path);
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
