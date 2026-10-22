# Life-like Train Minecraft Server

A Java Edition 1.20.1 (Forge) server built around realistic railways:

| Mod | What it gives you |
|---|---|
| **Create** | Real train tracks, bogeys, stations, signals, schedules, conductors |
| **Steam 'n' Rails** | Steam, diesel & electric locomotives, bigger bogeys, semaphore signals, switches |
| **Create: Railways Navigator** | Departure boards / route finding for passengers |
| **Create Diesel Generators** | Diesel engines for power |
| **FTB Chunks** | Claim stations/yards and keep chunks loaded for trains |
| **JEI** | Recipe lookup |

## Run it

Requires Docker and ~6 GB free RAM.

```sh
cd minecraft-train-server
cp .env.example .env     # set OPS to your username
docker compose up -d
docker compose logs -f mc   # wait for "Done"
```

Connect with **Minecraft Java 1.20.1 + Forge 47.x** and the same mods installed
(CurseForge/Modrinth app → create a 1.20.1 Forge profile and add the mods above).
Server address: your machine's IP, port `25565` (forward it on your router for friends).

## Getting realistic

1. Build **stations** with the Station block; name them.
2. Place **signals** between stations so trains block-section like real railways.
3. Give trains **schedules** (Create's Schedule item): go to station, wait, repeat.
4. Add a **Navigator** board in stations so passengers can pick a destination.
5. Claim your yard with FTB Chunks and enable force-loading so trains keep running when you're away.

## Admin

- Console: `docker attach train-mc` (detach with Ctrl-P Ctrl-Q)
- Backup: stop the server and copy `./data`
- Update mods: edit `MODRINTH_PROJECTS`, then `docker compose up -d --force-recreate`
