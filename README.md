# Sea-Kiz Name Vote

A small shared voting room for blind `0-3` scoring, backed by Supabase, with a host-triggered bottom-up reveal.

## Files

- `index.html` is the voter room.
- `host.html` is the host room.
- `config.js` holds the Supabase URL/key, voter slots, voter codes, round id, and host code.
- `supabase-schema.sql` creates the two tables and permissive policies for a small trusted voting group.

## Supabase Setup

1. Create a Supabase project.
2. Open the SQL editor and run `supabase-schema.sql`.
3. In Supabase, enable Realtime for the `rounds` and `votes` tables.
4. Copy `config.example.js` into `config.js`, or edit the existing `config.js`.
5. Replace:
   - `supabaseUrl`
   - `supabaseAnonKey`
   - `voters`
   - `hostCode`

The anon key is expected in a browser app. The current policies are deliberately simple for a small private group, so do not use this as-is for a public/high-stakes vote.

## Flow

1. Share `index.html` with voters.
2. Each voter picks their slot, enters their code, scores every name, and saves.
3. They can edit while the round is still open.
4. Open `host.html`, enter the host code, and use `Lock voting` or `Start bottom-up reveal`.
5. When reveal starts, all voter screens receive the realtime update, show a countdown, then unveil names from lowest total score to highest total score.
