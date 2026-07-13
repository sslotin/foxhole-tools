Project-scope context and status are consolidated in MEMORY.md. Start by reading MEMORY.md and keep it updated as the project evolves. Keep it clean, representing the current state of the project and not its history. Do not include information that is only relevant for a single file (use comments instead).

Write all temporary files you need just for research in tmp/.

Use a worktree while you are working and only "merge" when presenting results. There might be collisions with parallel sessions.

When you change a data-processing script, inspect the diff of the derived data to see if there are any unintended side effects and whether the change was correct.

This project involves parsing large JSON/CSV files. Avoid fully reading them and instead use search or tools such as head, grep and jq to analyze their structure.

Avoid running commands that can potentially "hang" for a prolonged period of time, and always make sure they have a reasonable time limit. This is not a compute-intensive project; if a script hangs, you're doing something wrong. Specifically game_data has A LOT of files and you should be excluding it from most code searches.

Search foxhole.wiki.gg via MediaWiki API first to get more context about the game, and ask questions if it fails, but ultimately derive data from the game fields and not the wiki (the game regularly updates and the data needs to be re-extracted).

Do not put full examples in comments/docs, rely on metadata and example files instead.

This project does not have downstream users or compatibility requirements. Feel free to refactor.
