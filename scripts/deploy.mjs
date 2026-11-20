// Build and publish dist/ to the gh-pages branch (GitHub Pages "deploy from branch").
// Usage: npm run deploy
import { execSync } from 'node:child_process'
import { writeFileSync, rmSync } from 'node:fs'

const run = (cmd, cwd = '.') => execSync(cmd, { cwd, stdio: 'inherit' })
const remote = execSync('git remote get-url origin').toString().trim()

run('npm test')
run('npm run build')
writeFileSync('dist/.nojekyll', '')
rmSync('dist/.git', { recursive: true, force: true })
run('git init -q -b gh-pages', 'dist')
run('git add -A', 'dist')
run('git -c user.name="TDAH Clock deploy" -c user.email="deploy@localhost" commit -q -m "Deploy"', 'dist')
run(`git push -f "${remote}" gh-pages`, 'dist')
rmSync('dist/.git', { recursive: true, force: true })
console.log('\nPublished. Site: https://<user>.github.io/tdah-clock/ (may take ~1 min)')
