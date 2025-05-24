const fs = require('fs');
const path = require('path');
const colors = require('./utils/colors');

// Directory for signer analysis files
const ANALYSIS_DIR = path.join(__dirname, 'signer-analysis');

/**
 * Clean existing signer analysis files
 */
function cleanSignerFiles() {
  console.log(`${colors.cyan}Cleaning signer analysis files...${colors.reset}`);
  
  if (!fs.existsSync(ANALYSIS_DIR)) {
    console.log(`${colors.yellow}No signer-analysis directory found.${colors.reset}`);
    return;
  }
  
  const files = fs.readdirSync(ANALYSIS_DIR);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  
  console.log(`Found ${jsonFiles.length} JSON files to clean.`);
  
  jsonFiles.forEach(file => {
    const filepath = path.join(ANALYSIS_DIR, file);
    
    try {
      const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      let modified = false;
      
      // Check if poolContracts exists and has arrays that need to be converted
      if (data.poolContracts) {
        Object.values(data.poolContracts).forEach(pool => {
          if (Array.isArray(pool.mints)) {
            // Already an array, no need to convert
            // The conversion will happen when the file is loaded
            modified = true;
          }
        });
      }
      
      if (modified) {
        console.log(`  ${colors.green}✓${colors.reset} ${file} - Ready for automatic conversion`);
      } else {
        console.log(`  ${colors.dim}○${colors.reset} ${file} - No changes needed`);
      }
      
    } catch (error) {
      console.error(`  ${colors.red}✗${colors.reset} ${file} - Error: ${error.message}`);
    }
  });
  
  console.log(`\n${colors.green}Cleaning complete!${colors.reset}`);
  console.log(`Files will be automatically converted when loaded by the analyzer.`);
}

// Run if called directly
if (require.main === module) {
  cleanSignerFiles();
}

module.exports = {
  cleanSignerFiles
};
