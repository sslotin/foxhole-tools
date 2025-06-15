import { metadata } from '../../../scanner'

const relevantItems = {
  SoldierSupplies: {
    short: "shirts",
    target: 100,
  },
  Cloth: {
    short: "bmats",
    target: 1000,
  },

  Bandages: {
    short: "bandage",
    target: 100,
  },
  FirstAidKit: {
    short: "first aid kit",
    target: 7,
  },
  BloodPlasma: {
    short: "plasma",
    target: 40,
  },
  TraumaKit: {
    short: "trauma kit",
    target: 6,
  },
  MedicUniformW: {
    short: "medic",
    target: 6,
  },
  MedicUniformC: {
    short: "medic",
    target: 6,
  },

  RifleAmmo: {
    short: '7.62mm',
    target: 100,
  },
  RifleW: {
    short: 'lough',
    target: 5,
  },
  RifleC: {
    short: 'argenti',
    target: 5,
  },

  WorkWrench: {
    short: 'wrench',
    target: 5,
  },

  WaterBucket: {
    short: 'bucket',
    target: 1,
  },

  Tripod: {
    short: 'tripod',
    target: 4,
  },

  TankMine: {
    short: 'AT mine',
    target: 3,
  },

  SwordC: {
    short: 'sword',
  },

  StickyBomb: {
    short: 'sticky',
    target: 30,
  },

  SniperRifleW: {
    short: 'raca',
    target: 1,
  },

  SniperRifleC: {
    short: 'auger',
    target: 1,
  },

  SmokeGrenade: {
    short: 'smoke',
    target: 2,
  },

  Shovel: {
    short: 'shovel',
    target: 2,
  },

  ShotgunW: {
    short: 'pillory',
    target: 15,
  },

  ShotgunC: {
    short: 'dragonfly',
    target: 25,
  },

  ShotgunAmmo: {
    short: 'buckshot',
    target: 70,
  },

  SatchelChargeW: {
    short: 'satchel',
    target: 3,
  },

  ExplosiveTripod: {
    short: 'havoc',
    target: 1,
  },

  SatchelChargeT: {
    short: 'detonator',
    target: 1,
  },

  SMGW: {
    short: 'fiddler',
    target: 12,
  },

  SMGHeavyW: {
    short: 'liar',
    target: 5,
  },

  SMGHeavyC: {
    short: 'lionclaw',
    target: 12,
  },

  SMGC: {
    short: 'pitch',
    target: 5,
  },

  SMGAmmo: {
    short: '9mm',
    target: 35,
  },

  RpgW: {
    short: 'cutler',
    target: 3,
  },

  RpgAmmo: {
    short: 'RPG',
    target: {
      warden: 15,
      collie: 0
    },
  },

  RifleShortW: {
    short: 'hawthorne',
  },

  RifleLongW: {
    short: 'cinder',
    target: 5,
  },

  RifleLongC: {
    short: 'omen',
    target: 5,
  },

  RifleLightW: {
    short: 'blakerow',
    target: 5,
  },

  RifleLightC: {
    short: 'fuscina',
    target: 5,
  },

  RifleHeavyC: {
    short: 'volta',
    target: 5,
  },

  RifleAutomaticW: {
    short: 'sampo',
    target: 5,
  },

  RifleAutomaticC: {
    short: 'catena',
    target: 5,
  },

  RifleHeavyW: {
    short: 'hangman',
    target: 5,
  },

  Revolver: {
    short: 'revolver',
  },

  RevolverAmmo: {
    short: '.44',
    target: 15,
  },

  Radio: {
    short: 'radio',
    target: 13,
  },

  RadioBackpack: {
    short: 'backpack',
    target: 1,
  },

  RPGTW: {
    short: 'foebreaker',
    target: 1,
  },

  PistolLightW: {
    short: 'cascadier',
  },

  MortarTankAmmo: {
    short: '250mm',
  },

  Mortar: {
    short: 'cremari',
    target: 1,
  },

  MortarAmmoSH: {
    short: 'shrapnel',
    target: 4,
  },

  MortarAmmo: {
    short: 'HE shell',
    target: 4,
  },

  MortarAmmoFlame: {
    short: 'incendiary',
    target: 4,
  },

  MortarAmmoFL: {
    short: 'flare',
    target: 4,
  },

  MaceW: {
    short: 'club',
  },

  MGW: {
    short: 'malone',
    target: 3,
  },

  MGTW: {
    short: 'ratcatcher',
    target: 1,
  },

  MGTC: {
    short: 'lamentum',
    target: 1,
  },

  MGC: {
    short: 'gast',
    target: 3,
  },

  MGAmmo: {
    short: '12.7mm',
    target: 12,
  },

  ListeningKit: {
    short: 'listening kit',
    target: 1,
  },

  InfantryMine: {
    short: 'AP mine',
    target: 3,
  },

  ISGTC: {
    short: 'ISG',
    target: 1,
  },

  HeavyExplosive: {
    short: 'hemats',
  },

  HELaunchedGrenade: {
    short: 'tremola',
    target: {
      warden: 0,
      collie: 20
    },
  },

  HEGrenade: {
    short: 'mammon',
    target: 10,
  },

  GrenadeW: {
    short: 'harpa',
    target: 25,
  },

  GrenadeLauncherTC: {
    short: 'fissura',
    target: 1,
  },

  GrenadeLauncherC: {
    short: 'lunaire',
    target: 3,
  },

  GrenadeC: {
    short: 'boma',
    target: 25,
  },

  GrenadeAdapter: {
    short: 'ospreay',
    target: 3,
  },

  GreenAsh: {
    short: 'gas',
    target: 10,
  },

  GasMask: {
    short: 'mask',
    target: 10,
  },

  GasMaskFilter: {
    short: 'filter',
    target: 20,
  },

  FlameTorchW: {
    short: 'flametorch',
  },

  FlameTorchC: {
    short: 'flametorch',
  },

  FlameBackpackW: {
    short: 'FT ammo',
  },

  FlameBackpackC: {
    short: 'FT ammo',
  },

  Explosive: {
    short: 'emats',
  },

  ExplosiveLightC: {
    short: 'hydra',
    target: 3,
  },

  Components: {
    short: 'comps',
  },

  Binoculars: {
    short: 'binos',
    target: 5,
  },

  Bayonet: {
    short: 'bayonet',
    target: 7,
  },

  AssaultRifleW: {
    short: 'aalto',
    target: 5,
  },

  AssaultRifleHeavyW: {
    short: 'booker',
    target: 7,
  },

  AssaultRifleHeavyC: {
    short: 'dusk',
    target: 10,
  },

  AssaultRifleC: {
    short: 'catara',
    target: 5,
  },

  AssaultRifleAmmo: {
    short: '7.92mm',
    target: 25,
  },

  ATRifleW: {
    short: 'neville',
    target: 3,
  },

  ATRifleTC: {
    short: 'typhon',
    target: 1,
  },

  ATRifleSniperC: {
    short: 'quickhatch',
    target: 1,
  },

  ATRifleLightC: {
    short: 'dawn',
    target: 3,
  },

  ATRifleAutomaticW: {
    short: 'greyhound',
    target: 3,
  },

  ATRifleAssaultW: {
    short: 'satterley',
    target: 3,
  },

  ATRifleAmmo: {
    short: '20mm',
    target: 10,
  },

  ATRPGW: {
    short: 'bonesaw',
    target: 2,
  },

  ATRPGTW: {
    short: 'mountsaw',
    target: 1,
  },

  ATRPGLightC: {
    short: 'ignifist',
    target: 5,
  },

  ATRPGIndirectAmmo: {
    short: 'ARC/RPG',
    target: {
      warden: 10,
      collie: 0
    },
  },

  ATRPGHeavyW: {
    short: 'carnyx',
    target: 5,
  },

  ATRPGHeavyC: {
    short: 'bane',
    target: 3,
  },

  ATRPGC: {
    short: 'venom',
    target: 3,
  },

  ATRPGAmmo: {
    short: 'AP/RPG',
    target: 30,
  },

  ATLaunchedGrenadeW: {
    short: 'varsi',
    target: 5,
  },

  ATGrenadeW: {
    short: 'flask',
    target: 5,
  },

  TankUniformW: {
    short: 'tanker',
    target: 3,
  },

  TankUniformC: {
    short: 'tanker',
    target: 3,
  },

  SnowUniformW: {
    short: 'parka',
  },

  SnowUniformC: {
    short: 'topcoat',
  },

  ScoutUniformW: {
    short: 'scout',
    target: 1,
  },

  ScoutUniformC: {
    short: 'scout',
    target: 1,
  },

  RainUniformC: {
    short: 'topcoat',
  },

  GrenadeUniformC: {
    short: 'grenadier',
    target: 3,
  },

  EngineerUniformW: {
    short: 'engineer',
    target: 1,
  },

  EngineerUniformC: {
    short: 'engineer',
    target: 1,
  },

  ArmourUniformW: {
    short: 'armour',
    target: 3,
  },

  ArmourUniformC: {
    short: 'vest',
    target: 3,
  },

  AmmoUniformW: {
    short: 'specialist',
    target: 3,
  },

  MiniTankAmmo: {
    short: '30mm',
    target: 10,
  },

  LightTankAmmo: {
    short: '40mm',
    target: 15,
  },

  ATAmmo: {
    short: '68mm',
    target: 15,
  },

  SandbagMaterials: {
    short: 'sandbag',
    target: 3,
  },

  BarbedWireMaterials: {
    short: 'wire',
    target: 3,
  },

  MetalBeamMaterials: {
    short: 'beam',
    target: 2,
  },

  Wood: {
    short: 'rmats',
  },

  Wreckage: {
    short: 'wreckage',
  },
};

function getTarget(name, settings) {
  const item = relevantItems[name];
  const meta = metadata[name];
  if (item.target === undefined || (meta.warden !== undefined && meta.warden != settings.warden)) {
    return 0;
  }
  const mult = settings.targetShirts / 100;
  if (typeof item.target === 'number') {
    return mult * item.target;
  }
  return mult * (settings.warden ? item.target.warden : item.target.collie);
}

function isDisplayed(name, count, settings) {
  const meta = metadata[name];
  return (count > 0 || getTarget(name, settings) > 0) && (meta.warden === undefined || settings.warden == meta.warden || (!name.includes('Uniform') && count > 0));
}

const relevantCrates = [
  ...Object.keys(relevantItems).filter((name) => !['Wreckage', 'Components'].includes(name)),
  'HeavyArtilleryAmmo',
  'LightArtilleryAmmo',
  'BannerTW',
  'BannerTC',
  'WindsockT',
  'GroundMaterials',
  'MaintenanceSupplies',
  'OfficerUniformW',
  'OfficerUniformC'
];

//console.log(relevantCrates);

export { relevantItems, relevantCrates, getTarget, isDisplayed };
