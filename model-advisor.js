// model-advisor: suggest a Claude model and effort level for a prompt, from keywords and
// shape alone (no AI call, so it costs nothing). Runs in the browser (index.html) and as a CLI:
//
//   node model-advisor.js "your prompt"      or      echo "prompt" | node model-advisor.js
//
// Rules of thumb it encodes: Opus only for design, hard debugging, big builds and
// research; Sonnet for routine work, troubleshooting and browser/desktop loops; Haiku for
// tiny mechanical lookups. Effort (thinking) rises with difficulty and repeated failures.
// Only the user's own words are scored; pasted text, attached files and links count little.
// Edit the weights in RULES to tune it for your own prompts.

(function (root) {
  // [regex, weight, reason]. Each rule counts once, however often it matches.
  const RULES = [
    // hard: design, deep debugging, big builds, research
    [/\b(architect(ure)?|system design|design (a|an|the)|redesign|re-?architect)\b/i, 4, 'design or architecture'],
    [/\b(refactor|rewrite|restructure|overhaul|from scratch)\b/i, 2.5, 'large rewrite or refactor'],
    [/\b(algorithm|complexity|optimi[sz]e|performance|bottleneck|profil(e|ing)|faster|speed (it )?up|fps|run (smoother|better))\b/i, 2.5, 'performance'],
    [/\b(race condition|deadlock|concurren\w*|thread(s|ing)?|async bug|memory leak|corrupt\w*)\b/i, 3, 'concurrency or subtle bugs'],
    [/\b(security|vulnerab\w*|exploit|auth(entication|orization)|threat model|encrypt\w*|malware|virus(es)?)\b/i, 2.5, 'security'],
    [/\b(root cause|investigate|diagnos\w*|figure out|audit)\b/i, 2.5, 'investigation'],
    [/\b(why|hangs?|hanging|freez\w*|crash\w*|bsod|blue screen|refuses|won't (load|open|start|work)|can't (hear|see|open|connect)|not (working|loading|opening|starting)|stutter\w*|slow(ly|s)?|lag(s|gy)?|messed up)\b/i, 2, 'troubleshooting'],
    [/\b(trade-?offs?|compare (approaches|options)|pros and cons|which approach|best way to)\b/i, 2, 'weighing approaches'],
    [/\b(plan (the|a|out)|make a plan|roadmap|strategy|spec(ification)?)\b/i, 2, 'planning'],
    [/\b(research|survey|deep dive|thoroughly|in depth|prove|proof|math\w*)\b/i, 2.5, 'research or rigor'],
    [/\b(migrat\w*|upgrade (to|from)|port (it|this|to))\b/i, 2, 'migration'],
    [/\b(build|make|create|write|develop)\s+(me\s+)?(a|an|the)?\s*([\w-]+\s+){0,2}(app|application|game|engine|system|server|site|website|backend|frontend|compiler|parser|tool|extension|plugin|bot|mod)\b/i, 3.5, 'building an app or tool'],
    [/\b(backend|frontend|database|full[- ]stack|web ui|gui)\b/i, 1.5, 'several layers'],
    [/\b(estimate|forecast|predict|calculate|analy[sz](e|is)|reckon|projection|how (fast|long) (will|would|until))\b/i, 2, 'analysis or estimation'],
    [/\b(complex|tricky|subtle|hard|difficult|edge cases?|end-to-end)\b/i, 1.5, 'described as hard'],
    // repeated failure: think harder
    [/\b(still (doesn't|does not|isn't|not|broken|fail\w*|crash\w*|just as|the same|happening|there|showing)|didn't work|doesn't work|keeps (fail|crash|break)\w*|tried (everything|that)|again and again|are you sure|same (problem|issue|error)|try again)\b/i, 3, 'earlier attempts failed'],
    // domain: fiddly multi-step work
    [/\b(unity|prefab|shaders?|materials?|avatars?|poiyomi|blender|mesh|rig|bones?|physbones?|vrchat|vrc)\b/i, 1, 'Unity / 3D work'],
    [/\b(bios|drivers?|partition\w*|format (the |a )?(drive|disk)|registry|firewall|network|router|port forward\w*|event viewer)\b/i, 1, 'system or network work'],
    // routine coding
    [/\b(implement|integrate)\b|\badd\b.{0,30}\b(features?|options?|flags?|buttons?|settings?|endpoints?|commands?|support|providers?|ui)\b/i, 1.5, 'feature work'],
    [/\b(local accounts?|user accounts?|multi-?user|log ?in|sign ?in|sync(ing|ed|s)?)\b/i, 1.5, 'accounts or syncing'],
    [/\b(write (a|an|the)? ?(script|function|class|test|tests|module|hook|query)|automate)\b/i, 1, 'writing a script or function'],
    [/\b(fix|bug|error|exception|broken)\b/i, 1, 'a fix'],
    [/\b(test(s|ing)?|review|improve|update|clean ?up)\b/i, 0.5, 'routine changes'],
    // light, mechanical
    [/\b(rename|typo|format(ting)? (the|this)|indent\w*|move (the|this|it|these|files?)|copy|delete (the|this|that)? ?files?|list (the|all|my|out)|show me|open (the|my)|install|commit|push|pull|run (the|it|this)|save and close)\b/i, -2, 'mechanical task'],
    [/\b(what is|what's|what does|how do i|how to|where is|where's|explain briefly|tl;?dr|define|how much of my)\b/i, -1.5, 'a quick question'],
    [/\b(quick(ly)?|simple|small|tiny|just (a|one|need|change|add|the)|one-?line|minor|trivial)\b/i, -1.5, 'described as small'],
    [/\b(translate|summari[sz]e|summary|spell(ing)?|grammar|reword|shorten)\b/i, -1.5, 'text editing'],
    [/\b(add (this|that|it) to (my )?memory|remember (this|that)|save (this|that) (to|in) memory)\b/i, -2, 'saving a note'],
  ];
  // Long tool loops in a browser or on the desktop: Sonnet does these at a fraction of the cost.
  const UI = /\b(click|screenshot|browser|website|web page|fill (in|out)? ?(the|a)? ?form|navigate|desktop app|computer use|listings?|for sale|on booth|booth\.pm|amazon|ebay|aliexpress|shop(ping)?|find me|search (the web|online)|(open|close|launch) (unity|steam|photoshop|everything|all))\b/i;
  const CONTINUE = /^\s*((y(es|ep|eah)?|ok(ay)?|sure|go( ahead| on)?|do (it|that|this)|continue|proceed|next|sounds good|lgtm|please|thanks|cool|great)\b[\s.!,]*)+$/i;
  // "Continue from the handoff", "pick up everything from the handoffs", an attached HANDOFF.md.
  const HANDOFF = /[^.!?\n]*(\b(continue|resume|pick(ing)? up|finish|from)\b[^.!?\n]{0,50}\bhand-?offs?\b|handoff\.md|session is a hand-?off)[^.!?,\n]*[.!?,]?/i;

  // score -> [model, effort]; first row whose limit the score is under wins.
  const TIERS = [
    [-2, 'Haiku', 'low'],
    [1.5, 'Sonnet', 'low'],
    [3.5, 'Sonnet', 'medium'],
    [6, 'Opus', 'medium'],
    [9, 'Opus', 'high'],
    [Infinity, 'Opus', 'max'],
  ];

  // Pasted text, attached files and links are things to read, not the request itself:
  // score only the user's own words, and count the rest separately.
  function strip(raw) {
    let pasted = 0, files = 0;
    const text = raw
      .replace(/<pasted_content[^>]*>[\s\S]*?(<\/pasted_content>|$)/gi, m => { pasted += m.length; return ' '; })
      .replace(/```[\s\S]*?```/g, m => { pasted += m.length; return ' [code] '; })
      .replace(/@"[^"]*"|@\S+\.\w+/g, () => { files++; return ' '; })
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/\s+/g, ' ').trim();
    return { text, pasted, files, code: /```/.test(raw) };
  }

  function advise(prompt) {
    const raw = String(prompt || '').trim();
    if (!raw) return { model: null, effort: null, score: 0, reasons: [], summary: 'Type a prompt.' };
    // Briefs written by another Claude session: that session picked the model already.
    if (/^(task|background) \(from the session that started this one\)/i.test(raw)) return { model: null, effort: null,
      score: 0, continuation: true, reasons: ['started by another session'], summary: 'A side session: the session that started it chose the model.' };
    let { text, pasted, files, code } = strip(raw);
    const reasons = [];
    let score = 0;

    const h = text.match(HANDOFF);
    if (h) {
      text = text.replace(h[0], ' ').replace(/\s+/g, ' ').trim();
      if (text.split(/\s+/).filter(Boolean).length < 8) return { model: null, effort: null, score: 0, continuation: true,
        reasons: ['continuing from a handoff'], summary: 'Depends on the task in the handoff: pick for that task, not for this message.' };
      reasons.push('continues a handoff; scored on the new request only');
    }
    if (CONTINUE.test(text)) return { model: null, effort: null, score: 0, continuation: true, reasons: ['a short reply to earlier work'],
      summary: 'Keep what the session already uses; switching models mid-session rebuilds the cache.' };

    // Long prompts trip many rules at once: the strongest signal counts fully, the next 60%,
    // the rest 30%, so a pile of keywords can't push routine work into Opus max.
    const hits = RULES.filter(([re]) => re.test(text));
    const pos = hits.filter(([, w]) => w > 0).map(([, w]) => w).sort((a, b) => b - a);
    score += (pos[0] || 0) + 0.6 * (pos[1] || 0) + 0.3 * pos.slice(2).reduce((a, b) => a + b, 0);
    for (const [, w, why] of hits) { if (w < 0) score += w; reasons.push(`${why} (${w > 0 ? '+' : ''}${w})`); }
    const memo = hits.some(([, , why]) => why === 'saving a note');
    const hard = hits.some(([, , why]) => /design|failed|research|concurrency/.test(why));

    const words = text.split(/\s+/).filter(Boolean).length;
    const len = words < 8 ? (pos.length ? 0 : -1) : words <= 40 ? 0 : words <= 120 ? 1 : 1.5;
    if (len) { score += len; reasons.push(`${words} words of request (${len > 0 ? '+' : ''}${len})`); }
    const items = (raw.match(/^\s*([-*•]|\d+[.)])\s+/gm) || []).length;
    if (items >= 3) { score += 1; reasons.push(`${items} listed requirements (+1)`); }
    if (code || /Traceback|\bat line \d+|^\s*at .+:\d+/m.test(raw)) { score += 1; reasons.push('code or a stack trace pasted (+1)'); }
    if (pasted > 1500) { score += 0.5; reasons.push(`${Math.round(pasted / 1000)}k chars pasted to read (+0.5)`); }
    if (files >= 3) { score += 0.5; reasons.push(`${files} files attached (+0.5)`); }

    if (memo) score = Math.min(score, 1); // saving pasted notes to memory is clerical, however long the paste
    let [, model, effort] = TIERS.find(([limit]) => score < limit);
    if (effort === 'max' && !hard) effort = 'high'; // max thinking only for clearly hard problems
    // Haiku only for short, clearly mechanical asks; anything else gets Sonnet.
    if (model === 'Haiku' && (words > 25 || pasted || files)) model = 'Sonnet';
    const ui = UI.test(text);
    if (ui) {
      reasons.push('browser or desktop control: long tool loops');
      if (model === 'Opus' && score < 6) { model = 'Sonnet'; effort = 'medium'; }
      if (model === 'Haiku') model = 'Sonnet';
    }
    const summary = {
      Haiku: 'Small mechanical task: the cheapest model is enough.',
      Sonnet: effort === 'low' ? 'Routine work: Sonnet with little thinking.' : 'Normal work with some steps: Sonnet, with some thinking.',
      Opus: effort === 'max' ? 'Hard, open-ended work: Opus with maximum thinking.' : 'Hard work: worth Opus.',
    }[model];
    return { model, effort, score: Math.round(score * 10) / 10, reasons, summary, ui };
  }

  const api = { advise, RULES, TIERS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ModelAdvisor = api;

  if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
    const arg = process.argv.slice(2).join(' ');
    const text = arg || require('fs').readFileSync(0, 'utf8');
    const r = advise(text);
    console.log(r.model ? `${r.model} · ${r.effort} effort  (score ${r.score})` : 'No recommendation');
    console.log(r.summary);
    if (r.reasons.length) console.log('Why: ' + r.reasons.join('; '));
  }
})(this);
