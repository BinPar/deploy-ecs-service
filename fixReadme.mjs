/** Script to fix README after autogenerate docs
 * @module fixReadme
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const readmePath = resolve(process.cwd(), './README.md');

const readme = readFileSync(readmePath, 'utf8');

const COMMENT_REGEX = /(<!--\s*start.*?-->)([\s\S]*?)(<!--\s*end.*?-->)/g;

const fixedReadme = readme.replace(COMMENT_REGEX, (_, startComment, content, endComment) => {
  return `${startComment}\n${content.trim()}\n${endComment}`;
});

writeFileSync(readmePath, fixedReadme);

process.stdout.write('README fixed\n');
