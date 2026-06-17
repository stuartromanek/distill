function slugify(artist: string, title: string) {
  return `${artist}-${title}`
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--verbose') {
      args.verbose = true
      continue
    }
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const val = argv[i + 1]
      if (val && !val.startsWith('--')) {
        args[key] = val
        i++
      }
    }
  }
  return args
}

export { slugify, parseArgs }
