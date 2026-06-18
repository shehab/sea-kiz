const config = window.SEA_KIZ_CONFIG;
const hostStatus = document.querySelector("#host-status");
const hostResults = document.querySelector("#host-results");
const hostCode = document.querySelector("#host-code");
const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

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

let votes = [];
let round = null;

function authorized() {
  if (hostCode.value === config.hostCode) return true;
  hostStatus.textContent = "Enter the host code first.";
  hostCode.focus();
  return false;
}

async function ensureRound() {
  const { data, error } = await client.from("rounds").select("*").eq("id", config.roundId).maybeSingle();
  if (error) throw error;
  if (data) return data;

  const { data: created, error: createError } = await client
    .from("rounds")
    .insert({ id: config.roundId, status: "voting" })
    .select("*")
    .single();
  if (createError) throw createError;
  return created;
}

async function fetchVotes() {
  const { data, error } = await client.from("votes").select("*").eq("round_id", config.roundId);
  if (error) throw error;
  votes = data || [];
}

function calculateResults() {
  return names
    .map((name) => {
      const scores = votes.filter((vote) => vote.name_option === name).map((vote) => vote.score);
      const total = scores.reduce((sum, score) => sum + score, 0);
      const threes = scores.filter((score) => score === 3).length;
      const spread = scores.length ? Math.max(...scores) - Math.min(...scores) : 0;
      return { name, total, threes, spread, votes: scores.length };
    })
    .sort((a, b) => b.total - a.total || b.threes - a.threes || a.spread - b.spread || a.name.localeCompare(b.name));
}

function render() {
  const savedVoters = [...new Set(votes.map((vote) => vote.voter_name))];
  hostStatus.textContent = `Status: ${round.status}. ${savedVoters.length} of ${config.voters.length} voters saved: ${savedVoters.join(", ") || "none"}.`;

  const maxScore = Math.max(config.voters.length * 3, 1);
  hostResults.innerHTML = calculateResults()
    .map((result, index) => {
      const width = `${(result.total / maxScore) * 100}%`;
      return `
        <article class="result-row">
          <span class="rank">#${index + 1}</span>
          <strong>${result.name}</strong>
          <div class="bar-track" aria-hidden="true">
            <div class="bar-fill" style="--score-width: ${width}"></div>
          </div>
          <span class="score">${result.total}</span>
          <small class="vote-detail">${result.votes} votes, ${result.threes} top scores</small>
        </article>
      `;
    })
    .join("");
}

async function setRoundStatus(status) {
  if (!authorized()) return;
  const { data, error } = await client
    .from("rounds")
    .update({ status, reveal_started_at: status === "revealing" ? new Date().toISOString() : null })
    .eq("id", config.roundId)
    .select("*")
    .single();
  if (error) {
    hostStatus.textContent = error.message;
    return;
  }
  round = data;
  render();
}

async function resetRound() {
  if (!authorized()) return;
  if (!confirm("Delete all votes and reopen voting?")) return;

  const { error: voteError } = await client.from("votes").delete().eq("round_id", config.roundId);
  if (voteError) {
    hostStatus.textContent = voteError.message;
    return;
  }

  await setRoundStatus("voting");
  await fetchVotes();
  render();
}

function subscribe() {
  client
    .channel(`sea-kiz-host-${config.roundId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rounds", filter: `id=eq.${config.roundId}` },
      (payload) => {
        round = payload.new;
        render();
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "votes", filter: `round_id=eq.${config.roundId}` },
      async () => {
        await fetchVotes();
        render();
      },
    )
    .subscribe();
}

async function init() {
  try {
    round = await ensureRound();
    await fetchVotes();
    render();
    subscribe();
  } catch (error) {
    hostStatus.textContent = error.message;
  }
}

document.querySelector("#start-reveal").addEventListener("click", () => setRoundStatus("revealing"));
document.querySelector("#lock-voting").addEventListener("click", () => setRoundStatus("locked"));
document.querySelector("#open-voting").addEventListener("click", () => setRoundStatus("voting"));
document.querySelector("#reset-round").addEventListener("click", resetRound);

init();
