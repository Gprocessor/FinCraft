/* FinCraft · ui/scrollable-tabs.js — makes overflowing .tabs bars discoverable.
   .tabs already scrolls horizontally (overflow-x:auto), but relying on a native
   scrollbar alone is a bad affordance — many OSes hide scrollbars until actively
   scrolling, so overflowing tabs just look cut off. This adds:
     1. Fade-gradient hints on whichever edge has more tabs to scroll to
     2. Vertical wheel/trackpad scroll translated to horizontal (people don't expect
        to shift+scroll a tab strip)
   Call once after rendering a .tabs element. */
export function enhanceScrollableTabs(tabsEl) {
  if (!tabsEl || tabsEl.dataset.scrollEnhanced) return;
  tabsEl.dataset.scrollEnhanced = '1';

  function update() {
    const { scrollLeft, scrollWidth, clientWidth } = tabsEl;
    tabsEl.classList.toggle('can-scroll-left', scrollLeft > 2);
    tabsEl.classList.toggle('can-scroll-right', scrollLeft + clientWidth < scrollWidth - 2);
  }

  tabsEl.addEventListener('scroll', update, { passive: true });
  tabsEl.addEventListener('wheel', (e) => {
    // Translate vertical wheel/trackpad motion into horizontal scroll when there's
    // more horizontal room to move than vertical (i.e. this is a tab strip, not a
    // normal page scroll) and the user didn't hold shift (which browsers already
    // treat as "scroll horizontally").
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && tabsEl.scrollWidth > tabsEl.clientWidth) {
      e.preventDefault();
      tabsEl.scrollLeft += e.deltaY;
    }
  }, { passive: false });

  // Re-check on resize (window resize, or sidebar collapse/expand changing available width)
  new ResizeObserver(update).observe(tabsEl);
  update();
}
