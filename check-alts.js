const { PublicKey } = require('@solana/web3.js');

// Common known Address Lookup Tables
const knownALTs = {
  // Jupiter v6 ALTs
  "D1ZN9Wj1fRSUQfCjhvnu1hqDMT7hzjzBBpi12nVniYD6": "Jupiter v6 ALT 1",
  "JCRGumoE9Qi5BBgULTgdgTLjSgkCMSbF62ZZfGs84JeU": "Jupiter v6 ALT 2",
  "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe": "Raydium Authority V4",
  
  // ALTs from your error messages
  "8oVj7mbN78g1AbQhXhD1u1QEwfDtzvcBD55xR8J7skXB": "Unknown ALT 1",
  "8EryG3Lu9aMWVzPWgpUf9cPY3jjpkVVqWdjByXhGsoBE": "Unknown ALT 2",
  "2LxXaf2q7yK7ZJ8WxG6HP7G9fuq9Po4A5YCi8XgiyHee": "Unknown ALT 3",
  "5nQzp7t4RyRoF3PNagqgNLZQTNcKPvUS1tNJgV4kPF2L": "Unknown ALT 4",
  "51r5BQ3fyLpUNfhqXm7dpT24jGs5paRMR73iioZbGYTf": "Unknown ALT 5",
  "A7R9uoW36o5JP8LiuBzAiefHMp9rgVwmeJTgbhwc71nK": "Unknown ALT 6",
  "5m8Dt9ZMHbD1t7y8EHHRwMLoRHmGDMnx2Urrg7z6fnLc": "Unknown ALT 7",
  "4sKLJ1Qoudh8PJyqBeuKocYdsZvxTcRShUt9aKqwhgvC": "Unknown ALT 8",
  "pvpgNDyK84nA6674apfehHQjM5LMdNaVRKPTNTswgmX": "Unknown ALT 9",
  "jhTkQUBNQFuJ5FK2BJ6HRRdSbGaCQrgsqerQxfbtggH": "Unknown ALT 10",
  "7cV7TN4wCGY1tTo7JGfnUb3PiNWqeJKfWeY5bDnBtmwh": "Unknown ALT 11",
  "DLBGFZxMuFbGr67UTEQaN2eej4kDR5bm1LaZLJFbSKGR": "Unknown ALT 12"
};

console.log('Address Lookup Tables that appear in your transactions:\n');

Object.entries(knownALTs).forEach(([address, name]) => {
  console.log(`${name}:`);
  console.log(`  ${address}`);
  console.log('');
});

console.log('\nThese ALTs are likely mainnet-beta tables.');
console.log('Make sure your RPC_URL points to mainnet-beta, not devnet.');
console.log('\nExample mainnet RPC URLs:');
console.log('- https://api.mainnet-beta.solana.com');
console.log('- Your QuickNode/Helius/etc mainnet endpoint');
