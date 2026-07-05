All project context, architecture, and status are consolidated in MEMORY.md. Start by reading MEMORY.md and keep it updated as the project evolves.

This project involves parsing large JSON/CSV files. Avoid fully reading them and instead use search or tools such as head, grep and jq to analyze their structure.

Avoid running commands that can potentially "hang" for a prolonged period of time. If you need to run a script that could hang, make sure it has a time limit. This is not a compute-intensive project; if a script hangs, you're doing something wrong. You should be excluding game_data from most code searches.

Do not put full examples in comments, rely on example files instead.

This project does not have downstream users or compatibility requirements. Feel free to refactor.
