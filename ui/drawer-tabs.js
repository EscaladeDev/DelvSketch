import { DEFAULT_DRAWER_OPEN, DEFAULT_PANEL_TAB } from "../app/constants.js"

export function createDrawerTabsController({
  leftDrawer,
  hudRoot,
  btnDrawerToggle,
  btnDrawerCollapse,
  panelTabButtons = [],
  panelPages = [],
  onPanelTabChanged,
} = {}) {
  let activePanelTab = DEFAULT_PANEL_TAB
  let drawerOpen = DEFAULT_DRAWER_OPEN

  function syncPanelTabs(){
    for (const b of panelTabButtons){
      const t = b?.dataset?.panelTab
      const active = t === activePanelTab
      b.classList.toggle("primary", active)
      b.setAttribute("aria-selected", active ? "true" : "false")
    }
    for (const p of panelPages){
      const active = p?.dataset?.panelPage === activePanelTab
      p.classList.toggle("hidden", !active)
      p.setAttribute("aria-hidden", active ? "false" : "true")
    }
  }

  function setPanelTab(tab){
    activePanelTab = (tab === "assets") ? "assets" : "style"
    if (typeof onPanelTabChanged === "function") onPanelTabChanged(activePanelTab)
    syncPanelTabs()
    return activePanelTab
  }

  function setDrawerOpen(open){
    drawerOpen = !!open
    if (leftDrawer) leftDrawer.classList.toggle("collapsed", !drawerOpen)
    if (hudRoot) hudRoot.classList.toggle("drawer-collapsed", !drawerOpen)
    if (btnDrawerToggle) btnDrawerToggle.setAttribute("aria-expanded", drawerOpen ? "true" : "false")
    if (btnDrawerCollapse) {
      btnDrawerCollapse.setAttribute("aria-expanded", drawerOpen ? "true" : "false")
      btnDrawerCollapse.title = drawerOpen ? "Collapse sidebar" : "Expand sidebar"
    }
    return drawerOpen
  }

  function toggleDrawer(){ return setDrawerOpen(!drawerOpen) }

  return {
    syncPanelTabs,
    setPanelTab,
    setDrawerOpen,
    toggleDrawer,
    get activePanelTab(){ return activePanelTab },
    get drawerOpen(){ return drawerOpen },
  }
}
