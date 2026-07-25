/**
 * YODIT Backend Integration
 * Replaces form onsubmit handlers directly on DOMContentLoaded.
 * This is the most reliable approach — no function overrides needed.
 */
(function() {
  'use strict';
  var SERVER = window.location.origin;
  var _token = null;
  var _socket = null;
  var _pendingEmail = null;
  async function api(path, method, body) {
    var headers = { 'Content-Type': 'application/json' };
    if (_token) headers['Authorization'] = 'Bearer ' + _token;
    var r = await fetch(SERVER + path, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined
    });
    var text = await r.text();
    var d;
    try { d = JSON.parse(text); } catch(e) { throw new Error('Server error — restart with npm start'); }
    if (!r.ok) throw new Error(d.error || 'Request failed');
    return d;
  }
  function connectSocket() {
    if (typeof io === 'undefined') return;
    try {
      _socket = io(SERVER, { transports: ['websocket', 'polling'] });
      _socket.on('connect', function() { if (_token) _socket.emit('authenticate', _token); });
      _socket.on('verification_code', function(data) { fillCodeInputs(data.code); });
      _socket.on('account_approved', function() { alert('✅ መለያዎ ጸድቋል!'); });
    } catch(e) {}
  }
  function showVerifyModal(email, expiresIn, code) {
    var old = document.getElementById('verifyModalOverlay');
    if (old) old.remove();
    var overlay = document.createElement('div');
    overlay.id = 'verifyModalOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:20px;font-family:system-ui,sans-serif';
    var sec = expiresIn || 600;
    var codeStr = code || '────';
    overlay.innerHTML =
      '<div style="background:#121B2E;border:2px solid #3DDC97;border-radius:24px;padding:32px 24px;max-width:400px;width:100%;text-align:center;color:#EAF1FF;box-shadow:0 24px 60px rgba(0,0,0,.5)">'+
        '<div style="font-size:40px;margin-bottom:8px">🔐</div>'+
        '<h3 style="font-size:20px;margin-bottom:4px">የማረጋገጫ ኮድ</h3>'+
        '<p style="color:#8FA3C4;font-size:13px;margin-bottom:12px"><b style="color:#4FC3F7">'+email+'</b></p>'+
        '<div style="font-size:48px;font-weight:900;letter-spacing:12px;color:#3DDC97;margin:8px 0;font-family:monospace;background:rgba(61,220,151,.1);border-radius:14px;padding:12px 8px" id="verifyCodeDisplay">'+codeStr+'</div>'+
        '<p style="color:#8FA3C4;font-size:11px;margin-bottom:10px">ኮዱን ከላይ ይቅዱና ከታች ያስገቡ</p>'+
        '<div style="display:flex;gap:8px;justify-content:center;margin-bottom:10px" id="verifyCodeInputs">'+
          '<input maxlength="1" inputmode="numeric" style="width:52px;height:56px;text-align:center;font-size:26px;font-weight:700;border-radius:12px;border:2px solid #223251;background:#0B1220;color:#EAF1FF;font-family:monospace" oninput="this.value=this.value.replace(/[^0-9]/g,\'\');if(this.value)this.nextElementSibling.focus()" onkeydown="if(event.key===\'Backspace\'&&!this.value)this.previousElementSibling.focus()" autofocus>'+
          '<input maxlength="1" inputmode="numeric" style="width:52px;height:56px;text-align:center;font-size:26px;font-weight:700;border-radius:12px;border:2px solid #223251;background:#0B1220;color:#EAF1FF;font-family:monospace" oninput="this.value=this.value.replace(/[^0-9]/g,\'\');if(this.value)this.nextElementSibling.focus()" onkeydown="if(event.key===\'Backspace\'&&!this.value)this.previousElementSibling.focus()">'+
          '<input maxlength="1" inputmode="numeric" style="width:52px;height:56px;text-align:center;font-size:26px;font-weight:700;border-radius:12px;border:2px solid #223251;background:#0B1220;color:#EAF1FF;font-family:monospace" oninput="this.value=this.value.replace(/[^0-9]/g,\'\');if(this.value)this.nextElementSibling.focus()" onkeydown="if(event.key===\'Backspace\'&&!this.value)this.previousElementSibling.focus()">'+
          '<input maxlength="1" inputmode="numeric" style="width:52px;height:56px;text-align:center;font-size:26px;font-weight:700;border-radius:12px;border:2px solid #223251;background:#0B1220;color:#EAF1FF;font-family:monospace" oninput="this.value=this.value.replace(/[^0-9]/g,\'\');window._ydtCheck()" onkeydown="if(event.key===\'Backspace\'&&!this.value)this.previousElementSibling.focus()">'+
        '</div>'+
        '<p style="color:#EF4444;font-size:12px;min-height:16px" id="verifyError"></p>'+
        '<p style="color:#8FA3C4;font-size:11px;margin-bottom:14px">ኮዱ የሚያበቃው በ� <b id="verifyCountdown">'+sec+'</b> ተፍጥንድ ነው</p>'+
        '<button onclick="document.getElementById(\'verifyModalOverlay\').remove()" style="background:none;border:1px solid #223251;color:#8FA3C4;padding:8px 16px;border-radius:8px;font-size:12px;cursor:pointer;margin-right:8px">ዝጋ</button>'+
        '<button onclick="window._ydtResend()" style="background:#2E9BFF;border:none;color:#fff;padding:8px 20px;border-radius:8px;font-size:12px;cursor:pointer;font-weight:600">እንደገና ላክ</button>'+
      '</div>';
    document.body.appendChild(overlay);
    var remaining = sec;
    var cdEl = document.getElementById('verifyCountdown');
    var timer = setInterval(function() {
      remaining--;
      if (cdEl) cdEl.textContent = remaining;
      if (remaining <= 0) { clearInterval(timer); if (cdEl) cdEl.textContent = '0 (አዥብቷል)'; }
    }, 1000);
    if (code) {
      setTimeout(function() { fillCodeInputs(code); }, 300);
    } else {
      setTimeout(function() {
        var f = document.querySelector('#verifyCodeInputs input');
        if (f) f.focus();
      }, 300);
    }
  }
  function fillCodeInputs(code) {
    var display = document.getElementById('verifyCodeDisplay');
    if (display) display.textContent = String(code);
    var inputs = document.querySelectorAll('#verifyCodeInputs input');
    var s = String(code);
    inputs.forEach(function(inp, i) {
      if (i < s.length) inp.value = s[i];
    });
    if (inputs.length > 0) { inputs[inputs.length-1].focus(); window._ydtCheck(); }
  }
  window._ydtCheck = async function() {
    var inputs = document.querySelectorAll('#verifyCodeInputs input');
    var code = '';
    inputs.forEach(function(inp) { code += inp.value; });
    if (code.length !== 4) return;
    var err = document.getElementById('verifyError');
    try {
      var result = await api('/api/auth/verify', 'POST', { email: _pendingEmail, code: code });
      _token = result.token;
      localStorage.setItem('yodit_jwt', _token);
      if (_socket) _socket.emit('authenticate', _token);
      var overlay = document.getElementById('verifyModalOverlay');
      if (overlay) overlay.remove();
      try { localStorage.setItem('yodit_current', _pendingEmail); } catch(e) {}
      try { localStorage.setItem('yodit_remote', 'on'); } catch(e) {}
      var serverData = {};
      try {
        var syncResult = await api('/api/user/sync', 'GET');
        if (syncResult.data && Object.keys(syncResult.data).length > 0) {
          serverData = syncResult.data;
        }
      } catch(e) { }
      if (typeof getUsers === 'function' && typeof saveUsers === 'function') {
        var users = getUsers();
        var existing = users[_pendingEmail] || {};
        users[_pendingEmail] = {
          name: (result.user||{}).name || existing.name || _pendingEmail.split('@')[0],
          pass: existing.pass || '',
          streak: serverData.streak || existing.streak || 0,
          best: serverData.best || existing.best || 0,
          lastDate: serverData.lastDate || existing.lastDate || null,
          history: serverData.history || existing.history || {},
          phase: serverData.phase || existing.phase || 0,
          msgPool: serverData.msgPool || existing.msgPool || [],
          reminder: serverData.reminder || existing.reminder || {on:false,time:'19:00'},
          claimedChallenges: serverData.claimedChallenges || existing.claimedChallenges || {},
          weeklyGoal: serverData.weeklyGoal || existing.weeklyGoal || 7
        };
        saveUsers(users);
        try { localStorage.setItem('yodit_current', _pendingEmail); } catch(e) {}
      }
      if (typeof enterApp === 'function') enterApp();
      _startSync();
    } catch(e) {
      if (err) err.textContent = '❌ ' + e.message;
      inputs.forEach(function(inp) { inp.value = ''; });
      if (inputs[0]) inputs[0].focus();
    }
  };
  window._ydtResend = async function() {
    if (!_pendingEmail) return;
    try {
      var result = await api('/api/auth/resend-code', 'POST', { email: _pendingEmail });
      var err = document.getElementById('verifyError');
      if (err) { err.style.color = '#3DDC97'; err.textContent = '✓ አዲስ ኮድ ተልኳል'; }
      if (result.code) fillCodeInputs(result.code);
    } catch(e) {
      var err = document.getElementById('verifyError');
      if (err) err.textContent = e.message;
    }
  };
  var _syncTimer = null;
  function _startSync() {
    if (_syncTimer) clearInterval(_syncTimer);
    _syncTimer = setInterval(_syncToServer, 30000);
  }
  async function _syncToServer() {
    if (!_token) return;
    try {
      if (typeof getCurrentEmail !== 'function' || typeof getUsers !== 'function') return;
      var curEmail = getCurrentEmail() || _pendingEmail;
      if (!curEmail) return;
      var users = getUsers();
      var cur = users[curEmail];
      if (!cur) return;
      await api('/api/user/data', 'POST', { data: {
        streak: cur.streak||0, best: cur.best||0, phase: cur.phase||0,
        history: cur.history||{}, lastDate: cur.lastDate||null,
        msgPool: cur.msgPool||[], reminder: cur.reminder||{on:false,time:'19:00'},
        claimedChallenges: cur.claimedChallenges||{}, weeklyGoal: cur.weeklyGoal||7
      }});
    } catch(e) {}
  }
  document.addEventListener('DOMContentLoaded', function() {
    _token = localStorage.getItem('yodit_jwt');
    connectSocket();
    if (_token) _startSync();
    window.__yodit_loaded = true;
    var signinForm = document.getElementById('formSignin');
    if (signinForm) {
      signinForm.onsubmit = async function(e) {
        e.preventDefault();
        var emailEl = document.getElementById('siEmail');
        var passEl = document.getElementById('siPass');
        var errEl = document.getElementById('siError');
        var email = emailEl ? emailEl.value.trim().toLowerCase() : '';
        var pass = passEl ? passEl.value : '';
        if (!email || !pass) {
          if (errEl) errEl.textContent = 'ኢሜይል እና የይለፍ ቃል ያስፈልጋል';
          return false;
        }
        try {
          var result = await api('/api/auth/login', 'POST', { email: email, password: pass });
          if (result.requiresVerification) {
            _pendingEmail = email;
            showVerifyModal(email, result.codeExpiresIn || 600, result.code);
            return false;
          }
        } catch(e) {
          var isNetErr = e instanceof TypeError || (e.message && (e.message.indexOf('Failed to fetch')>=0 || e.message.indexOf('NetworkError')>=0));
          if (isNetErr) {
            if (typeof getUsers === 'function' && typeof enterApp === 'function') {
              var users = getUsers();
              if (!users[email] || users[email].pass !== pass) {
                if (errEl) errEl.textContent = 'ኢሜይል ወይም የይለፍ ቃል ትክክል አይደለም';
                return false;
              }
              try { localStorage.setItem('yodit_current', email); } catch(e) {}
              enterApp();
            }
          } else {
            if (errEl) { errEl.style.color = '#EF4444'; errEl.textContent = e.message; }
          }
        }
        return false;
      };
      console.log('[Yodit] Signin form intercepted ✓');
    }
    var signupForm = document.getElementById('formSignup');
    if (signupForm) {
      signupForm.onsubmit = async function(e) {
        e.preventDefault();
        var nameEl = document.getElementById('suName');
        var emailEl = document.getElementById('suEmail');
        var passEl = document.getElementById('suPass');
        var errEl = document.getElementById('suError');
        var name = nameEl ? nameEl.value.trim() : '';
        var email = emailEl ? emailEl.value.trim().toLowerCase() : '';
        var pass = passEl ? passEl.value : '';
        if (!email || !pass) {
          if (errEl) errEl.textContent = 'ኢሜይል እና የይለፍ ቃል ያስፈልጋል';
          return false;
        }
        try {
          var result = await api('/api/auth/register', 'POST', { name: name || email.split('@')[0], email: email, password: pass });
          if (errEl) { errEl.style.color = '#3DDC97'; errEl.textContent = '✅ ' + result.message; }
          try { localStorage.setItem('yodit_remote', 'on'); } catch(e) {}
          if (typeof getUsers === 'function' && typeof saveUsers === 'function') {
            var users = getUsers();
            if (!users[email]) {
              users[email] = { name: name || email.split('@')[0], pass: pass,
                streak:0, best:0, lastDate:null, history:{}, phase:0, msgPool:[],
                reminder:{on:false,time:'19:00'}, claimedChallenges:{}, weeklyGoal:7 };
              saveUsers(users);
            }
          }
        } catch(e) {
          var isNetErr = e instanceof TypeError || (e.message && (e.message.indexOf('Failed to fetch')>=0 || e.message.indexOf('NetworkError')>=0));
          if (isNetErr) {
            if (typeof getUsers === 'function' && typeof saveUsers === 'function') {
              var users = getUsers();
              if (users[email]) { if (errEl) errEl.textContent = 'ይህ ኢሜይል ቀድሞ ተመዝግቧል'; return false; }
              users[email] = { name: name || email.split('@')[0], pass: pass,
                streak:0, best:0, lastDate:null, history:{}, phase:0, msgPool:[],
                reminder:{on:false,time:'19:00'}, claimedChallenges:{}, weeklyGoal:7 };
              saveUsers(users);
              try { localStorage.setItem('yodit_current', email); } catch(e) {}
              if (typeof enterApp === 'function') enterApp();
            }
          } else {
            if (errEl) { errEl.style.color = '#EF4444'; errEl.textContent = e.message; }
          }
        }
        return false;
      };
      console.log('[Yodit] Signup form intercepted ✓');
    }
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  });
})();
