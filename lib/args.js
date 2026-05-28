const args = process.argv.slice(2);
const positionalArgs = [];

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg.startsWith("--")) {
    const next = args[i + 1];
    if (next && !next.startsWith("--")) {
      i += 1;
    }
    continue;
  }
  positionalArgs.push(arg);
}

function getPositionalArg(index, defaultValue = undefined) {
  return positionalArgs[index] ?? defaultValue;
}

function getArg(name, defaultValue = undefined) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return defaultValue;
  const next = args[index + 1];
  if (!next || next.startsWith("--")) return true;
  return next;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

export { getPositionalArg, getArg, hasFlag };
