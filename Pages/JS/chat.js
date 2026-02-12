document.addEventListener('DOMContentLoaded', () => {
  const userInput = document.getElementById('userInput');
  const mainBody = document.getElementById('mainBody');

  // Detect typing to hide hero section
  userInput.addEventListener('input', () => {
      // .trim() ensures that spaces alone don't trigger the hide
      if (userInput.value.trim().length > 0) {
          mainBody.classList.add('is-typing');
      } else {
          mainBody.classList.remove('is-typing');
      }
  });

  // Optional: Auto-resize textarea height as user types
  userInput.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = (this.scrollHeight) + 'px';
      
      // Cap the height so it doesn't take over the whole screen
      if (this.scrollHeight > 150) {
          this.style.overflowY = 'scroll';
          this.style.height = '150px';
      } else {
          this.style.overflowY = 'hidden';
      }
  });
});