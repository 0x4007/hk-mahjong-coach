const requestedHands = Number.parseInt(process.argv[2] ?? "10000", 10);

if (!Number.isInteger(requestedHands) || requestedHands < 1) {
  throw new Error("Simulation count must be a positive integer");
}

process.stdout.write(
  `Simulation gate is unavailable until the authoritative state machine is implemented (${String(requestedHands)} hands requested).\n`,
);
process.exitCode = 1;
