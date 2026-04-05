/**
 * Creates a copy of Aaron's resume with contact info stripped,
 * then converts to PDF via LibreOffice.
 *
 * Usage: node scripts/strip-resume-contact.mjs
 */
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, cpSync } from 'fs';
import { join, resolve } from 'path';

const SOURCE = resolve('/home/a/Aaron_Rohrbacher.docx');
const TMPDIR = resolve('/tmp/resume-strip');
const TMPFILE = join(TMPDIR, 'resume.docx');
const OUTPUT = resolve('public/Aaron_Rohrbacher_Resume.pdf');

// Clean tmp
rmSync(TMPDIR, { recursive: true, force: true });
mkdirSync(TMPDIR, { recursive: true });

// Copy the original
cpSync(SOURCE, TMPFILE);

// docx is a zip — unzip, modify XML, rezip
const UNZIPDIR = join(TMPDIR, 'unzipped');
mkdirSync(UNZIPDIR, { recursive: true });
execSync(`unzip -o "${TMPFILE}" -d "${UNZIPDIR}"`, { stdio: 'pipe' });

// Patterns to strip
const patternsToRemove = [
  /rohrbac@gmail\.com/gi,
  /rohrbac\s*@\s*gmail\s*\.?\s*com/gi,
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g,  // phone numbers
  /mailto:[^"<\s]*/gi,
];

function stripXml(filePath) {
  let content = readFileSync(filePath, 'utf8');
  for (const pattern of patternsToRemove) {
    content = content.replace(pattern, '');
  }
  // Remove hyperlink elements pointing to mailto
  content = content.replace(/<w:hyperlink[^>]*mailto[^>]*>.*?<\/w:hyperlink>/gs, '');
  // Remove Relationship elements pointing to mailto
  content = content.replace(/<Relationship[^>]*mailto[^>]*\/>/gi, '');
  writeFileSync(filePath, content);
}

// Process main document
const wordDir = join(UNZIPDIR, 'word');
stripXml(join(wordDir, 'document.xml'));

// Process headers and footers
for (const file of readdirSync(wordDir)) {
  if ((file.startsWith('header') || file.startsWith('footer')) && file.endsWith('.xml')) {
    stripXml(join(wordDir, file));
  }
}

// Process relationships
const relsDir = join(wordDir, '_rels');
for (const file of readdirSync(relsDir)) {
  if (file.endsWith('.rels')) {
    stripXml(join(relsDir, file));
  }
}

// Re-zip using the original as base (preserves zip structure)
// Delete original zip first, then create new one from the unzipped dir
const OUTZIP = join(TMPDIR, 'stripped.docx');

// Use 7z but with proper deflate method matching docx expectations
execSync(`cd "${UNZIPDIR}" && 7z a -tzip -mx=5 -mm=Deflate "${OUTZIP}" . -r`, { stdio: 'pipe' });

// Convert to PDF with LibreOffice
execSync(`libreoffice --headless --convert-to pdf --outdir "${TMPDIR}" "${OUTZIP}"`, {
  stdio: 'pipe',
  timeout: 60000,
});

// Copy PDF to public/
const pdfFile = join(TMPDIR, 'stripped.pdf');
cpSync(pdfFile, OUTPUT);

console.log(`Done: ${OUTPUT}`);

// Cleanup
rmSync(TMPDIR, { recursive: true, force: true });
