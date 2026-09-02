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
	// lock.py encrypts every protected page with one password, so the unlock is
	// shared: entering it on any project opens them all for this session.
	var KEY = 'dj-unlock';
	if (!window.crypto || !crypto.subtle) return;      // needs a secure context

	function storedPw() { try { return sessionStorage.getItem(KEY); } catch (e) { return null; } }
	function storePw(pw) { try { sessionStorage.setItem(KEY, pw); } catch (e) {} }
	function clearPw() { try { sessionStorage.removeItem(KEY); } catch (e) {} }

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

	// Unlock the target page fully, right here: decrypt its copy, decrypt every
	// image, then swap it into this document and correct the URL. Navigating
	// instead would make the destination page repeat all of this, which is what
	// caused the "Unlocking..." flash.
	async function unlockInPlace(path, pw, status) {
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

		// throws on a wrong password, before we have changed anything
		var plain = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: bytes(iv) }, key, bytes(ct));
		var data = JSON.parse(new TextDecoder().decode(plain));

		var ids = Object.keys(data.assets);
		var page = data.html;
		for (var i = 0; i < ids.length; i++) {
			var id = ids[i];
			if (status) status('Unlocking… ' + (i + 1) + ' of ' + ids.length);
			try {
				var buf = new Uint8Array(await (await fetch('/locked-assets/' + id + '.enc')).arrayBuffer());
				var raw = await crypto.subtle.decrypt(
					{ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12));
				// blob URLs stay valid because we rewrite this same document
				var url = URL.createObjectURL(new Blob([raw], { type: data.assets[id].t }));
				page = page.split('__ENC__' + id + '__').join(url);
			} catch (e) { /* one bad asset shouldn't block the page */ }
		}

		storePw(pw);

		// put the right URL in the bar, then replace the document in place
		try { history.pushState({ djUnlocked: path }, '', path); } catch (e) {}

		// document.open() discards this document's listeners, so the Back
		// handler has to be part of the page we are about to write - otherwise
		// going back changes the URL while leaving the case study on screen.
		var backFix = '<script>window.addEventListener("popstate",' +
			'function(){location.reload();});<\/script>';
		var at = page.lastIndexOf('</body>');
		page = at > -1 ? page.slice(0, at) + backFix + page.slice(at) : page + backFix;

		document.open();
		document.write(page);
		document.close();
	}

	// Wire a panel's form up: unlock in place, reporting progress on the panel.
	function wireForm(root, path) {
		var form = root.querySelector('.dj-lock-form');
		var input = root.querySelector('.dj-lock-input');
		var btn = root.querySelector('.dj-lock-btn');
		var msg = root.querySelector('.dj-lock-msg');

		function say(text, err) {
			msg.textContent = text;
			msg.className = 'dj-lock-msg' + (err ? ' dj-lock-err' : '');
		}

		form.addEventListener('submit', async function (e) {
			e.preventDefault();
			if (!input.value) return;
			btn.disabled = true;
			say('Unlocking…');
			try {
				await unlockInPlace(path, input.value, function (m) { say(m); });
			} catch (err) {
				say('That password didn’t work.', true);
				btn.disabled = false;
				input.select();
			}
		});
		return { input: input, msg: msg, btn: btn };
	}

	function unlockedAlready() { return !!storedPw(); }

	/* ---- homepage card: form revealed over the artwork -------------------- */
	function enhanceCard(figure, path) {
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

		function say(text, err) {
			parts.msg.textContent = text;
			parts.msg.className = 'dj-lock-msg' + (err ? ' dj-lock-err' : '');
		}

		var link = figure.querySelector('a[href="' + path + '"]');
		if (link) {
			link.addEventListener('click', async function (e) {
				e.preventDefault();
				var pw = storedPw();
				if (!pw) { open(); return; }
				// already unlocked another project this session: go straight in,
				// showing progress instead of asking again
				figure.classList.add('dj-open', 'dj-unlocking');
				say('Unlocking…');
				try {
					await unlockInPlace(path, pw, say);
				} catch (err) {
					clearPw();                       // stale or wrong: ask properly
					figure.classList.remove('dj-unlocking');
					say('That password didn’t work.', true);
					parts.input.focus();
				}
			});
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

		function say(text, err) {
			parts.msg.textContent = text;
			parts.msg.className = 'dj-lock-msg' + (err ? ' dj-lock-err' : '');
		}

		dialogs[path] = {
			open: function (from) {
				opener = from || null;
				dlg.classList.remove('dj-unlocking');
				dlg.classList.add('dj-open');
				requestAnimationFrame(function () {
					requestAnimationFrame(function () { parts.input.focus(); });
				});
			},
			openUnlocking: function () {
				dlg.classList.add('dj-open', 'dj-unlocking');
			},
			showForm: function () { dlg.classList.remove('dj-unlocking'); },
			say: say
		};
		return dialogs[path];
	}

	function enhanceLink(link, path) {
		link.classList.add('dj-locked-link');
		link.addEventListener('click', async function (e) {
			e.preventDefault();
			var d = dialogFor(path);
			var pw = storedPw();
			if (!pw) { d.open(link); return; }
			d.openUnlocking();
			try {
				await unlockInPlace(path, pw, d.say);
			} catch (err) {
				clearPw();
				d.showForm();
				d.say('That password didn’t work.', true);
			}
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
