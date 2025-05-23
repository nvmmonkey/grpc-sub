/**
 * Simple rate limiter for RPC calls
 */
class RateLimiter {
  constructor(maxCallsPerSecond = 10) {
    this.maxCallsPerSecond = maxCallsPerSecond;
    this.callTimes = [];
    this.queue = [];
    this.processing = false;
  }

  async call(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      // Remove calls older than 1 second
      const now = Date.now();
      this.callTimes = this.callTimes.filter(time => now - time < 1000);
      
      // Check if we can make a call
      if (this.callTimes.length < this.maxCallsPerSecond) {
        const { fn, resolve, reject } = this.queue.shift();
        this.callTimes.push(now);
        
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      } else {
        // Wait before checking again
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    this.processing = false;
  }
}

module.exports = { RateLimiter };
