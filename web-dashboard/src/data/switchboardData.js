/* -------------------------------------------------------------
 * AuraHome — Switchboard Wiring Specifications
 * Parsed directly from SWITCH NAMING ( FLOORS ).pdf
 * ------------------------------------------------------------- */

window.INITIAL_BOARDS = {
  hall: {
    id: "hall",
    name: "Hall Switchboard",
    floor: "Ground Floor",
    points: [
      { id: "h1", num: 1, name: "FAN",        desc: "Controls Main Hall Fan",        icon: "fa-fan",       type: "fan",       state: true  },
      { id: "h2", num: 2, name: "LIGHT",      desc: "Controls Hall Main Light",       icon: "fa-lightbulb", type: "light",     state: true  },
      { id: "h4", num: 4, name: "CHANDELIER", desc: "Controls Decorative Chandelier", icon: "fa-gem",       type: "chandelier", state: false }
    ]
  },
  first_floor: {
    id: "first_floor",
    name: "First Floor Room",
    floor: "1st Floor",
    points: [
      { id: "f2", num: 2, name: "NIGHT BULB",      desc: "Controls Night Lamp",     icon: "fa-moon",      type: "light",      state: true,  },
      { id: "f4", num: 4, name: "FAN (Regulator)", desc: "Controls Fan Speed",      icon: "fa-fan",       type: "fan",        state: true,  hasRegulator: true, speed: 3 },
      { id: "f5", num: 5, name: "LIGHT",           desc: "Controls Room Light",     icon: "fa-lightbulb", type: "light",      state: false },
      { id: "f6", num: 6, name: "CHANDELIER",      desc: "Controls Room Chandelier", icon: "fa-gem",      type: "chandelier", state: false }
    ]
  },
  harry: {
    id: "harry",
    name: "Harry Room",
    floor: "2nd Floor",
    points: [
      { id: "hr3", num: 3, name: "NIGHT BULB",    desc: "Controls Night Bulb",  icon: "fa-moon",    type: "light",     state: true  },
      { id: "hr4", num: 4, name: "FAN",           desc: "Controls Ceiling Fan", icon: "fa-fan",     type: "fan",       state: true  },
      { id: "hr5", num: 5, name: "LIGHT",         desc: "Controls Study Light", icon: "fa-lightbulb", type: "light",   state: true  },
      { id: "hr6", num: 6, name: "FAN REGULATOR", desc: "Controls Fan Speed",   icon: "fa-sliders", type: "regulator", state: true,  hasRegulator: true, speed: 4 }
    ]
  },
  mom_dad: {
    id: "mom_dad",
    name: "Mom and Dad Room",
    floor: "1st Floor",
    points: [
      { id: "md2", num: 2, name: "SMART LIGHT", desc: "Controls RGB Smart Light", icon: "fa-wand-magic-sparkles", type: "light",      state: true  },
      { id: "md4", num: 4, name: "FAN",         desc: "Controls Master Bed Fan",  icon: "fa-fan",                type: "fan",        state: false },
      { id: "md5", num: 5, name: "LIGHT",       desc: "Controls Ambient Light",   icon: "fa-lightbulb",          type: "light",      state: true  },
      { id: "md6", num: 6, name: "CHANDELIER",  desc: "Controls Chandelier",      icon: "fa-gem",                type: "chandelier", state: false }
    ]
  },
  ayush: {
    id: "ayush",
    name: "Ayush Room",
    floor: "2nd Floor",
    points: [
      { id: "ay1", num: 1, name: "FAN (Regulator)", desc: "Controls Main Fan",            icon: "fa-fan",       type: "fan",   state: true,  hasRegulator: true, speed: 5 },
      { id: "ay2", num: 2, name: "LIGHT MAIN",      desc: "Controls Main Light",          icon: "fa-lightbulb", type: "light", state: true  },
      { id: "ay3", num: 3, name: "NIGHT BULB",      desc: "Controls Night Lamp",          icon: "fa-star",      type: "light", state: false },
      { id: "ay5", num: 5, name: "BROWN FAN",       desc: "Controls Secondary Fan",       icon: "fa-fan",       type: "fan",   state: false },
      { id: "ay6", num: 6, name: "CENTRE LIGHT",    desc: "Controls Centre Light Socket", icon: "fa-plug",      type: "light", state: true  }
    ]
  }
};

