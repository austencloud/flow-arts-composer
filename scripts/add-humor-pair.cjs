#!/usr/bin/env node
/**
 * Add a humor training pair to the profile
 *
 * Usage:
 *   node scripts/add-humor-pair.cjs <word> <selected-text> <lens> [rejected-json]
 *
 * Examples:
 *   node scripts/add-humor-pair.cjs "NOVA" "A star's dramatic exit" "DICTIONARY"
 *   node scripts/add-humor-pair.cjs "NOVA" "A star's dramatic exit" "DICTIONARY" '[{"text":"Briefly notable","lens":"DEADPAN"}]'
 */

const fs = require('fs');
const path = require('path');

// The humor profile is private training data kept in the austencloud/flow-arts-private
// clone. FLOW_ARTS_PRIVATE_DIR points at that clone when it isn't at E:/flow-arts-private.
const PRIVATE_DIR = process.env.FLOW_ARTS_PRIVATE_DIR || 'E:/flow-arts-private';
const PROFILE_PATH = path.join(PRIVATE_DIR, 'humor', 'humor-profile.json');

function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.error('Usage: node scripts/add-humor-pair.cjs <word> <selected-text> <lens> [rejected-json]');
    console.error('');
    console.error('Lenses: DEADPAN, ABSURDIST, SARDONIC, DICTIONARY, DOMAIN, ACRONYM, DARK, ROLEPLAY');
    console.error('');
    console.error('Examples:');
    console.error('  node scripts/add-humor-pair.cjs "NOVA" "A star\'s dramatic exit" "DICTIONARY"');
    process.exit(1);
  }

  const [word, selectedText, lens, rejectedJson] = args;

  const validLenses = ['DEADPAN', 'ABSURDIST', 'SARDONIC', 'DICTIONARY', 'DOMAIN', 'ACRONYM', 'DARK', 'ROLEPLAY', 'META'];
  if (!validLenses.includes(lens.toUpperCase())) {
    console.error(`Invalid lens: ${lens}`);
    console.error(`Valid lenses: ${validLenses.join(', ')}`);
    process.exit(1);
  }

  // Load existing profile
  let profile;
  try {
    const content = fs.readFileSync(PROFILE_PATH, 'utf-8');
    profile = JSON.parse(content);
  } catch (err) {
    console.error(`Failed to load humor profile: ${err.message}`);
    process.exit(1);
  }

  // Parse rejected options if provided
  let rejected = [];
  if (rejectedJson) {
    try {
      rejected = JSON.parse(rejectedJson);
    } catch (err) {
      console.error(`Failed to parse rejected JSON: ${err.message}`);
      process.exit(1);
    }
  }

  // Check if word already exists
  const existingIndex = profile.trainingPairs.findIndex(
    p => p.word.toUpperCase() === word.toUpperCase()
  );

  const newPair = {
    word: word.toUpperCase(),
    selected: { text: selectedText, lens: lens.toUpperCase() },
    rejected
  };

  if (existingIndex >= 0) {
    // Update existing
    profile.trainingPairs[existingIndex] = newPair;
    console.log(`Updated existing pair for "${word.toUpperCase()}"`);
  } else {
    // Add new
    profile.trainingPairs.push(newPair);
    console.log(`Added new pair for "${word.toUpperCase()}"`);
  }

  // Update lens distribution
  const lensKey = lens.toUpperCase();
  profile.lensDistribution[lensKey] = (profile.lensDistribution[lensKey] || 0) + 1;

  // Save profile
  try {
    fs.writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2) + '\n');
    console.log(`Saved to ${PROFILE_PATH}`);
    console.log(`Total training pairs: ${profile.trainingPairs.length}`);
  } catch (err) {
    console.error(`Failed to save profile: ${err.message}`);
    process.exit(1);
  }
}

main();
