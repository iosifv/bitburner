# bitburner


## Project Context

This is a **Bitburner game automation suite** — JavaScript scripts that run inside the Bitburner incremental hacking game. 
There is no build system, no npm, and no tests. Scripts are edited locally and synced to the game client in real time via the `bitburner-go-filesync` executable.
Information on this executable can be found here: [BitburnerGoFilesync](https://github.com/CTNOriginals/BitburnerGoFilesync)

## Setup

1. run `./bitburner-go-filesync`
2. take note of the `config.toml`
3. navigate to settings in the Bitburner Game and connect.


## Folder Structure

- archive = old scripts, kept for historic purposes
- lib = library folder
- savefiles = manual savefile library (not synced)
- viruses = folder with virus scripts meant to infect every server in the game