const names = [
  "Marijani",
  "Quartern",
  "Coraline",
  "Terala",
  "Korel 1",
  "Emersea",
  "Coraledge",
  "Baharia",
  "Edge Park",
  "Kutoroka",
  "Marajeo",
  "Kijiji",
  "Patana",
  "Umoja",
  "Rahari",
  "Raharo",
  "Makazia",
  "Bado",
  "Jumuiya",
  "Nyota",
  "Sea-Kiz",
  "Ziraleet",
];

const config = window.SEA_KIZ_CONFIG;
const fallbackConfig =
  !config || config.supabaseUrl.includes("YOUR_PROJECT_REF") || config.supabaseAnonKey.includes("YOUR_SUPABASE");

const appState = {
  round: null,
  votes: [],
  voter: null,
  revealTimer: null,
};

const supabaseClient = fallbackConfig
  ? null
  : window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

const form = document.querySelector("#vote-form");
const voterName = document.querySelector("#voter-name");
const voterCode = document.querySelector("#voter-code");
const statusCopy = document.querySelector("#status-copy");
const resultsPanel = document.querySelector("#results-panel");
const resultsList = document.querySelector("#results-list");
const waitingPanel = document.querySelector("#waiting-panel");
const countdown = document.querySelector("#countdown");
const saveButton = document.querySelector("#save-vote");

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function setStatus(message) {
  statusCopy.textContent = message;
}

function renderForm() {
  form.innerHTML = names
    .map((name) => {
      const slug = slugify(name);
      const options = [0, 1, 2, 3]
        .map(
          (score) => `
            <span>
              <input id="${slug}-${score}" name="${slug}" value="${score}" type="radio" />
              <label for="${slug}-${score}" title="${score} out of 3">${score}</label>
            </span>
          `,
        )
        .join("");

      return `
        <article class="name-card">
          <h3>${name}</h3>
          <div class="score-control" aria-label="Score ${name}">
            ${options}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderVoters() {
  const voters = config?.voters || [];
  voterName.innerHTML = [
    `<option value="">Choose voter</option>`,
    ...voters.map((voter) => `<option value="${voter.name}">${voter.name}</option>`),
  ].join("");
}

function getVoter() {
  if (!config?.voters) return null;
  const name = voterName.value.trim();
  const code = voterCode.value.trim();
  const voter = config.voters.find(
    (item) => item.name.toLowerCase() === name.toLowerCase() && item.code === code,
  );
  appState.voter = voter || null;
  return appState.voter;
}

function getVoterVotes(name) {
  return appState.votes.filter((vote) => vote.voter_name === name);
}

function loadCurrentVoterVotes() {
  const voter = getVoter();
  form.reset();
  if (!voter) return;

  getVoterVotes(voter.name).forEach((vote) => {
    const input = form.querySelector(`input[name="${slugify(vote.name_option)}"][value="${vote.score}"]`);
    if (input) input.checked = true;
  });
}

function setVotingLocked(locked) {
  form.querySelectorAll("input").forEach((input) => {
    input.disabled = locked;
  });
  saveButton.disabled = locked;
}

function updateStatus() {
  if (fallbackConfig) {
    setStatus("Add your Supabase settings in config.js to enable shared voting.");
    return;
  }

  const savedVoters = [...new Set(appState.votes.map((vote) => vote.voter_name))];
  const totalVoters = config.voters.length;
  const label = savedVoters.length === 1 ? "voter" : "voters";
  const locked = appState.round?.status !== "voting";

  setVotingLocked(locked);

  if (appState.round?.status === "revealing" || appState.round?.status === "revealed") {
    setStatus("The reveal has started. Voting is locked.");
    return;
  }

  if (!savedVoters.length) {
    setStatus(`Voting is open. 0 of ${totalVoters} voters have saved.`);
    return;
  }

  setStatus(`Voting is open. ${savedVoters.length} ${label} saved: ${savedVoters.join(", ")}.`);
}

function collectScores() {
  const scores = [];
  const missing = [];

  names.forEach((name) => {
    const checked = form.querySelector(`input[name="${slugify(name)}"]:checked`);
    if (!checked) {
      missing.push(name);
      return;
    }
    scores.push({ name_option: name, score: Number(checked.value) });
  });

  return { scores, missing };
}

async function ensureRound() {
  const { data, error } = await supabaseClient
    .from("rounds")
    .select("*")
    .eq("id", config.roundId)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const { data: created, error: createError } = await supabaseClient
    .from("rounds")
    .insert({ id: config.roundId, status: "voting" })
    .select("*")
    .single();

  if (createError) throw createError;
  return created;
}

async function fetchVotes() {
  const { data, error } = await supabaseClient
    .from("votes")
    .select("*")
    .eq("round_id", config.roundId)
    .order("created_at");

  if (error) throw error;
  appState.votes = data || [];
}

async function saveVote() {
  if (fallbackConfig) return;

  const voter = getVoter();
  if (!voter) {
    setStatus("Choose your voter name and enter its code before saving.");
    voterName.focus();
    return;
  }

  if (appState.round?.status !== "voting") {
    setStatus("Voting is locked because the reveal has started.");
    return;
  }

  const { scores, missing } = collectScores();
  if (missing.length) {
    setStatus(`Score every name before saving. Missing: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "..." : ""}.`);
    return;
  }

  const rows = scores.map((score) => ({
    round_id: config.roundId,
    voter_name: voter.name,
    name_option: score.name_option,
    score: score.score,
  }));

  const { error } = await supabaseClient.from("votes").upsert(rows, {
    onConflict: "round_id,voter_name,name_option",
  });

  if (error) {
    setStatus(error.message);
    return;
  }

  await fetchVotes();
  updateStatus();
}

function calculateResults() {
  return names
    .map((name) => {
      const scores = appState.votes
        .filter((vote) => vote.name_option === name)
        .map((vote) => vote.score);
      const total = scores.reduce((sum, score) => sum + score, 0);
      const threes = scores.filter((score) => score === 3).length;
      const spread = scores.length ? Math.max(...scores) - Math.min(...scores) : 0;

      return { name, scores, total, threes, spread };
    })
    .sort((a, b) => a.total - b.total || b.threes - a.threes || a.spread - b.spread || a.name.localeCompare(b.name));
}

function renderSealedResults() {
  resultsList.innerHTML = calculateResults()
    .map(
      (_, index) => `
        <article class="result-row sealed">
          <span class="rank">${index + 1}</span>
          <strong>Sealed name</strong>
          <div class="bar-track" aria-hidden="true"><div class="bar-fill" style="--score-width: 0%"></div></div>
          <span class="score">--</span>
          <small class="vote-detail">Waiting</small>
        </article>
      `,
    )
    .join("");
}

async function revealResults() {
  await fetchVotes();
  const results = calculateResults();
  const maxScore = Math.max(config.voters.length * 3, 1);

  waitingPanel.classList.remove("is-hidden");
  resultsPanel.classList.remove("is-hidden");
  renderSealedResults();

  clearInterval(appState.revealTimer);
  let count = 5;
  countdown.textContent = count;

  appState.revealTimer = setInterval(() => {
    count -= 1;
    countdown.textContent = count > 0 ? count : "Reveal";
    if (count > 0) return;

    clearInterval(appState.revealTimer);
    waitingPanel.classList.add("is-hidden");
    const rows = [...resultsList.querySelectorAll(".result-row")];

    results.forEach((result, index) => {
      window.setTimeout(() => {
        const row = rows[index];
        const width = `${(result.total / maxScore) * 100}%`;
        const voteText = result.scores.length === 1 ? "vote" : "votes";
        const rank = results.length - index;
        row.classList.remove("sealed");
        row.classList.add("revealed");
        row.innerHTML = `
          <span class="rank">#${rank}</span>
          <strong>${result.name}</strong>
          <div class="bar-track" aria-hidden="true">
            <div class="bar-fill" style="--score-width: ${width}"></div>
          </div>
          <span class="score">${result.total}</span>
          <small class="vote-detail">${result.scores.length} ${voteText}, ${result.threes} top scores</small>
        `;
      }, index * 900);
    });
  }, 1000);
}

function subscribeToChanges() {
  supabaseClient
    .channel(`sea-kiz-${config.roundId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rounds", filter: `id=eq.${config.roundId}` },
      (payload) => {
        appState.round = payload.new;
        updateStatus();
        if (payload.new.status === "revealing" || payload.new.status === "revealed") revealResults();
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "votes", filter: `round_id=eq.${config.roundId}` },
      async () => {
        await fetchVotes();
        updateStatus();
        loadCurrentVoterVotes();
      },
    )
    .subscribe();
}

async function init() {
  renderForm();
  renderVoters();

  if (fallbackConfig) {
    updateStatus();
    setVotingLocked(true);
    return;
  }

  try {
    appState.round = await ensureRound();
    await fetchVotes();
    updateStatus();
    loadCurrentVoterVotes();
    subscribeToChanges();

    if (appState.round.status === "revealing" || appState.round.status === "revealed") {
      revealResults();
    }
  } catch (error) {
    setStatus(error.message);
  }
}

voterName.addEventListener("change", loadCurrentVoterVotes);
voterCode.addEventListener("change", loadCurrentVoterVotes);
saveButton.addEventListener("click", saveVote);
document.querySelector("#clear-current").addEventListener("click", () => {
  form.reset();
  voterName.value = "";
  voterCode.value = "";
  voterName.focus();
});

init();
