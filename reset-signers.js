const fs = require('fs');
const path = require('path');
const colors = require('./utils/colors');

// Directory for signer analysis files
const ANALYSIS_DIR = path.join(__dirname, 'signer-analysis');

/**
 * Reset signer analysis files
 */
function resetSignerFiles() {
  console.log(`${colors.cyan}Resetting signer analysis files...${colors.reset}`);
  
  if (!fs.existsSync(ANALYSIS_DIR)) {
    console.log(`${colors.yellow}No signer-analysis directory found. Creating one...${colors.reset}`);
    fs.mkdirSync(ANALYSIS_DIR, { recursive: true });
    console.log(`${colors.green}Created signer-analysis directory.${colors.reset}`);
    return;
  }
  
  const files = fs.readdirSync(ANALYSIS_DIR);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  
  console.log(`Found ${jsonFiles.length} JSON files to reset.`);
  
  if (jsonFiles.length === 0) {
    console.log(`${colors.yellow}No files to reset.${colors.reset}`);
    return;
  }
  
  // Ask for confirmation
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  readline.question(`\n${colors.yellow}This will delete all ${jsonFiles.length} signer analysis files. Continue? (y/N): ${colors.reset}`, (answer) => {
    readline.close();
    
    if (answer.toLowerCase() === 'y') {
      jsonFiles.forEach(file => {
        const filepath = path.join(ANALYSIS_DIR, file);
        try {
          fs.unlinkSync(filepath);
          console.log(`  ${colors.green}✓${colors.reset} Deleted ${file}`);
        } catch (error) {
          console.error(`  ${colors.red}✗${colors.reset} Error deleting ${file}: ${error.message}`);
        }
      });
      
      console.log(`\n${colors.green}Reset complete! All signer analysis files have been removed.${colors.reset}`);
      console.log(`The analyzer will start fresh with new data.`);
    } else {
      console.log(`${colors.yellow}Reset cancelled.${colors.reset}`);
    }
  });
}

// Run if called directly
if (require.main === module) {
  resetSignerFiles();
}

module.exports = {
  resetSignerFiles
};
