import assert from 'node:assert/strict';
import test from 'node:test';
import { absoluteSeoTitle, seoPageTitle, SEO_HOME_TITLES, SEO_SITES } from '../../src/lib/seoTitles.js';

test('home titles use one descriptive, site-specific convention', () => {
  assert.deepEqual(SEO_HOME_TITLES, {
    main: 'Aaron Rohrbacher | Lead Software Engineer & DevOps Architect',
    music: 'Aaron Rohrbacher Music | Recordings & Downloads',
    portaputer: 'PortaPuter | Portable Windows PC Capture',
  });
});

test('child titles normalize whitespace and put the site name last', () => {
  assert.equal(seoPageTitle('  System   Requirements ', SEO_SITES.portaputer), 'System Requirements | PortaPuter');
  assert.equal(seoPageTitle('A Train', SEO_SITES.music), 'A Train | Aaron Rohrbacher Music');
});

test('empty page or site names cannot produce vague titles', () => {
  assert.throws(() => seoPageTitle('', SEO_SITES.main));
  assert.throws(() => seoPageTitle('About', '  '));
});

test('absolute title metadata bypasses accidental parent-template duplication', () => {
  assert.deepEqual(absoluteSeoTitle('About | Aaron Rohrbacher'), {
    absolute: 'About | Aaron Rohrbacher',
  });
});
