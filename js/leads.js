/* ── eureach.eu — Lead Finder ────────────────────────── */

/* ── i18n labels ─────────────────────────────────────── */
const I18N = {
  el: {
    panelTitle:    "Επιλογές Αναζήτησης",
    labelCountry:  "Χώρα",
    labelCity:     "Πόλη",
    labelCat:      "Κατηγορία",
    labelSubcat:   "Κλάδος / Υπηρεσία",
    labelRadius:   "Ακτίνα Αναζήτησης",
    placeholderCountry: "— Επιλέξτε χώρα —",
    placeholderCity:    "— Επιλέξτε πόλη —",
    placeholderCat:     "— Επιλέξτε κατηγορία —",
    placeholderSubcat:  "— Επιλέξτε υπηρεσία —",
    searchBtn:     "🔍 Αναζήτηση Leads",
    clearBtn:      "Καθαρισμός",
    searching:     "Αναζήτηση…",
    loadingSub:    "Σάρωση Google Maps · Εμπλουτισμός με AI",
    emptyTitle:    "Δεν υπάρχουν αποτελέσματα",
    emptySub:      "Επιλέξτε κατηγορία και πόλη και πατήστε Αναζήτηση",
    validCountry:  "Παρακαλώ επιλέξτε χώρα",
    validCity:     "Παρακαλώ επιλέξτε πόλη",
    validCat:      "Παρακαλώ επιλέξτε κατηγορία",
    validSubcat:   "Παρακαλώ επιλέξτε υπηρεσία",
  },
  de: {
    panelTitle:    "Suchoptionen",
    labelCountry:  "Land",
    labelCity:     "Stadt",
    labelCat:      "Kategorie",
    labelSubcat:   "Branche / Dienstleistung",
    labelRadius:   "Suchradius",
    placeholderCountry: "— Land auswählen —",
    placeholderCity:    "— Stadt auswählen —",
    placeholderCat:     "— Kategorie auswählen —",
    placeholderSubcat:  "— Dienstleistung auswählen —",
    searchBtn:     "🔍 Leads suchen",
    clearBtn:      "Zurücksetzen",
    searching:     "Suche läuft…",
    loadingSub:    "Google Maps scannen · KI-Anreicherung",
    emptyTitle:    "Noch keine Ergebnisse",
    emptySub:      "Kategorie und Stadt wählen, dann Suche starten",
    validCountry:  "Bitte Land auswählen",
    validCity:     "Bitte Stadt auswählen",
    validCat:      "Bitte Kategorie auswählen",
    validSubcat:   "Bitte Dienstleistung auswählen",
  },
  en: {
    panelTitle:    "Search Options",
    labelCountry:  "Country",
    labelCity:     "City",
    labelCat:      "Category",
    labelSubcat:   "Industry / Service",
    labelRadius:   "Search Radius",
    placeholderCountry: "— Select country —",
    placeholderCity:    "— Select city —",
    placeholderCat:     "— Select category —",
    placeholderSubcat:  "— Select service —",
    searchBtn:     "🔍 Search Leads",
    clearBtn:      "Clear",
    searching:     "Searching…",
    loadingSub:    "Scanning Google Maps · Enriching with AI",
    emptyTitle:    "No results yet",
    emptySub:      "Select a category and city, then hit Search",
    validCountry:  "Please select a country",
    validCity:     "Please select a city",
    validCat:      "Please select a category",
    validSubcat:   "Please select a service",
  },
};

function getLang(countryKey) {
  if (!countryKey) return "en";
  if (countryKey.includes("Greece") || countryKey.includes("Cyprus")) return "el";
  if (countryKey.includes("Germany") || countryKey.includes("Austria") || countryKey.includes("Switzerland")) return "de";
  return "en";
}

/* ── Categories ──────────────────────────────────────── */
const CATEGORIES = [
  { icon:"🏥", name:"Health & Medical", slug:"health", sub:[
    { icon:"🏥", name:"Medical Services", slug:"doctor" },
    { icon:"🦷", name:"Dentists", slug:"dentist" },
    { icon:"🏥", name:"Physiotherapy", slug:"physiotherapist" },
    { icon:"🧠", name:"Psychologists", slug:"psychologist" },
    { icon:"💊", name:"Pharmacies", slug:"pharmacy" },
    { icon:"👓", name:"Opticians", slug:"optician" },
    { icon:"🐾", name:"Veterinarians", slug:"veterinarian" },
  ]},
  { icon:"🏠", name:"Home Services", slug:"home", sub:[
    { icon:"⚡", name:"Electricians", slug:"electrician" },
    { icon:"🔧", name:"Plumbers", slug:"plumber" },
    { icon:"🚿", name:"Drain Cleaning", slug:"drain-cleaning" },
    { icon:"🪚", name:"Carpenters", slug:"carpenter" },
    { icon:"🎨", name:"Painters", slug:"painter" },
    { icon:"🔑", name:"Locksmiths", slug:"locksmith" },
    { icon:"📹", name:"Security Systems", slug:"security-systems" },
    { icon:"🧹", name:"Cleaning Services", slug:"cleaning" },
    { icon:"📦", name:"Moving Services", slug:"moving" },
  ]},
  { icon:"💻", name:"Technology", slug:"tech", sub:[
    { icon:"💻", name:"Computer Repair & IT", slug:"computer-tech" },
    { icon:"📺", name:"Appliance Technicians", slug:"appliance-tech" },
  ]},
  { icon:"⚖️", name:"Professional Services", slug:"professional", sub:[
    { icon:"⚖️", name:"Lawyers", slug:"lawyer" },
    { icon:"📊", name:"Accountants", slug:"accountant" },
    { icon:"🏢", name:"Business Services", slug:"business-services" },
    { icon:"📐", name:"Architects", slug:"architect" },
    { icon:"📏", name:"Surveyors", slug:"surveyor" },
    { icon:"🛡️", name:"Insurance", slug:"insurance" },
  ]},
  { icon:"🚗", name:"Transport & Auto", slug:"transport", sub:[
    { icon:"🚗", name:"Car Mechanics", slug:"car-mechanic" },
    { icon:"🚗", name:"Driving Schools", slug:"driving-school" },
    { icon:"🚕", name:"Taxi & Transport", slug:"taxi" },
  ]},
  { icon:"💄", name:"Beauty & Wellness", slug:"beauty", sub:[
    { icon:"💄", name:"Beauty & Wellness", slug:"beauty" },
    { icon:"💇", name:"Hair Salons", slug:"hair-salon" },
    { icon:"💆", name:"Aestheticians", slug:"aesthetician" },
    { icon:"🏋️", name:"Gyms & Fitness", slug:"gym" },
  ]},
  { icon:"🍽️", name:"Food & Dining", slug:"food", sub:[
    { icon:"🍽️", name:"Restaurants", slug:"restaurant" },
    { icon:"🍷", name:"Restaurants & Tavernas", slug:"restaurant-tavernas" },
  ]},
  { icon:"🏨", name:"Accommodation", slug:"accommodation", sub:[
    { icon:"🏨", name:"Hotels", slug:"hotel" },
    { icon:"🏨", name:"Boutique Hotels", slug:"boutique-hotel" },
    { icon:"🏖️", name:"Resort Hotels", slug:"resort-hotel" },
    { icon:"🏡", name:"Villas & Luxury Rentals", slug:"villas" },
    { icon:"🏠", name:"Airbnb / Short-term Rentals", slug:"short-term-rentals" },
    { icon:"🛏️", name:"Rooms & Studios", slug:"rooms-to-let" },
    { icon:"🏘️", name:"Guesthouses & B&Bs", slug:"guesthouses" },
    { icon:"🌾", name:"Agrotourism", slug:"agrotourism" },
    { icon:"⛺", name:"Camping", slug:"camping" },
    { icon:"✨", name:"Glamping", slug:"glamping" },
  ]},
  { icon:"✈️", name:"Travel & Tourism", slug:"travel", sub:[
    { icon:"✈️", name:"Travel Agencies", slug:"travel-agency" },
    { icon:"🗺️", name:"Tour Operators", slug:"tour-operator" },
    { icon:"🚌", name:"Transfers & Excursions", slug:"transfers" },
  ]},
  { icon:"⚽", name:"Sports & Recreation", slug:"sports", sub:[
    { icon:"⚽", name:"Football Clubs", slug:"football-club" },
    { icon:"🏃", name:"Personal Trainers", slug:"personal-trainer" },
    { icon:"🎾", name:"Tennis Clubs", slug:"tennis-club" },
  ]},
  { icon:"🏗️", name:"Construction & Real Estate", slug:"construction", sub:[
    { icon:"🏗️", name:"Construction Companies", slug:"construction-engineering" },
    { icon:"🏠", name:"Real Estate Agencies", slug:"real-estate" },
  ]},
  { icon:"🛒", name:"Retail & Commerce", slug:"retail", sub:[
    { icon:"🛒", name:"Retail Stores", slug:"retail" },
    { icon:"🛋️", name:"Furniture Shops", slug:"furniture" },
    { icon:"💐", name:"Florists", slug:"florist" },
    { icon:"⛽", name:"Gas Stations", slug:"gas-station" },
  ]},
  { icon:"📚", name:"Education", slug:"education", sub:[
    { icon:"📚", name:"Schools & Education", slug:"education" },
    { icon:"📚", name:"Tutoring Centers", slug:"tutoring" },
    { icon:"🎓", name:"Language Schools", slug:"language-school" },
  ]},
  { icon:"📷", name:"Creative & Events", slug:"creative", sub:[
    { icon:"📷", name:"Photographers", slug:"photographer" },
    { icon:"🎬", name:"Videographers", slug:"videographer" },
    { icon:"🎉", name:"Event Planners", slug:"event-planner" },
  ]},
  { icon:"📌", name:"Other", slug:"other-group", sub:[
    { icon:"📌", name:"Other / Miscellaneous", slug:"other" },
  ]},
];

/* ── Country → cities ────────────────────────────────── */
const COUNTRIES = {
  "🇬🇷 Greece":         ["Athens", "Thessaloniki", "Patras", "Heraklion", "Rhodes", "Chania", "Larissa", "Volos", "Ioannina", "Kavala", "Corfu", "Kalamata", "Santorini", "Mykonos", "Nafplio"],
  "🇩🇪 Germany":        ["Berlin", "Munich", "Hamburg", "Cologne", "Frankfurt", "Stuttgart", "Düsseldorf", "Leipzig", "Dortmund", "Essen", "Bremen", "Dresden", "Hannover", "Nuremberg", "Bonn"],
  "🇦🇹 Austria":        ["Vienna", "Graz", "Linz", "Salzburg", "Innsbruck", "Klagenfurt", "Villach", "Wels", "Sankt Pölten", "Dornbirn"],
  "🇨🇭 Switzerland":    ["Zurich", "Geneva", "Basel", "Bern", "Lausanne", "Winterthur", "Lucerne", "St. Gallen", "Lugano", "Biel"],
  "🇬🇧 United Kingdom": ["London", "Birmingham", "Manchester", "Glasgow", "Leeds", "Liverpool", "Sheffield", "Edinburgh", "Bristol", "Cardiff"],
  "🇨🇾 Cyprus":         ["Nicosia", "Limassol", "Larnaca", "Paphos", "Famagusta", "Kyrenia"],
};

/* ── Mock lead data ──────────────────────────────────── */
// Each entry: { el: [...], de: [...], en: [...] }
const MOCK_NAMES = {
  doctor: {
    el: ["Ιατρείο Παπαδόπουλου", "Κλινική Αγία Σοφία", "Πολυϊατρείο Αθηνών", "Ιατρείο Γεωργίου", "Κλινική Υγεία"],
    de: ["Dr. Müller Praxis", "Hausarztpraxis Schneider", "Allgemeinmedizin Bauer", "Arztpraxis Weber", "Gemeinschaftspraxis Koch"],
    en: ["City Medical Centre", "Dr. Smith & Partners", "Highstreet Medical", "Central Health Clinic", "Family Doctor Practice"],
  },
  dentist: {
    el: ["Οδοντιατρείο Νικολάου", "Κλινική Χαμόγελο", "Οδοντίατρος Κώστας", "Dental Clinic Athens", "Smile Studio GR"],
    de: ["Zahnarzt Fischer", "Dental Studio Weiß", "Zahnarztpraxis Müller", "Zahnarzt am Markt", "Moderne Zahnarztpraxis"],
    en: ["SmileCare Dental", "Perfect Teeth Clinic", "City Dental Centre", "Bright Smile Dentistry", "Family Dental Practice"],
  },
  physiotherapist: {
    el: ["Φυσικοθεραπευτήριο Αλέξη", "Κινησιοθεραπεία Νίκου", "PhysioCenter Athens", "Κέντρο Αποκατάστασης", "RehabCare GR"],
    de: ["Praxis für Physiotherapie Bauer", "PhysioFit Schmidt", "Physiotherapie Zentrum", "Krankengymnastik Hoffmann", "PhysioTeam München"],
    en: ["PhysioPlus Clinic", "ActiveCare Physio", "City Physiotherapy", "Movement Health Centre", "RehabCare Physio"],
  },
  psychologist: {
    el: ["Ψυχολόγος Δήμητρα", "Θεραπευτήριο Ψυχής", "Mind & Wellness GR", "Ψυχολογικό Κέντρο", "Counseling Athens"],
    de: ["Psychologische Praxis Koch", "Praxis Seelenwohl", "Psychotherapie Zentrum", "Psychologe Müller", "Institut für Psychologie"],
    en: ["Mind & Wellness Centre", "Counseling Partners", "City Psychology Clinic", "Mindful Therapy Group", "Wellbeing Practice"],
  },
  pharmacy: {
    el: ["Φαρμακείο Γεωργίου", "Φαρμακείο Ακρόπολη", "Φαρμακείο Κεντρικό", "City Pharmacy GR", "Φαρμακείο 24ωρο"],
    de: ["Apotheke Zentral", "Stadtapotheke Müller", "Apotheke am Markt", "Rats-Apotheke", "Löwen-Apotheke"],
    en: ["Central Pharmacy", "HealthPlus Pharmacy", "City Chemist", "Well Pharmacy", "Boots Pharmacy"],
  },
  optician: {
    el: ["Οπτικά Βασίλη", "Κέντρο Όρασης", "Οπτικά Κεντρικά", "VisionCare GR", "Οπτικά Αθηνών"],
    de: ["Optik Schneider", "Augenoptik Weber", "Brillen & Kontaktlinsen", "Optiker am Marktplatz", "Sehzentrum Müller"],
    en: ["VisionCare Opticians", "ClearSight Opticians", "Specsavers City", "Eye Care Centre", "The Optical Shop"],
  },
  veterinarian: {
    el: ["Κτηνιατρείο Σταύρου", "Ζωοφιλική Κλινική", "PetCare GR", "Κτηνιατρείο Αθηνών", "Animal Clinic GR"],
    de: ["Tierarztpraxis Braun", "Tierarzt am Markt", "Kleintierpraxis Müller", "Tierärztliche Gemeinschaftspraxis", "Tierklinik Zentrum"],
    en: ["City Vet Clinic", "PetCare Veterinary", "Animal Health Centre", "VetPlus Practice", "The Veterinary Surgery"],
  },
  electrician: {
    el: ["Ηλεκτρολόγος Κώστας", "Αδελφοί Ηλεκτρολόγοι", "PowerFix GR", "Ηλεκτρολογικές Εγκαταστάσεις", "Ηλεκτρολόγος Νίκος"],
    de: ["Elektro Müller GmbH", "Elektromeister Bauer", "Elektroservice Schneider", "Elektrotechnik Weber", "Elektro am Haus"],
    en: ["PowerFix Electrical", "VoltPro Services", "City Electrician", "Bright Spark Electrical", "ProElectric Solutions"],
  },
  plumber: {
    el: ["Υδραυλικός Γιάννης", "Αδελφοί Υδραυλικοί", "AquaFix GR", "Υδραυλικές Εγκαταστάσεις", "Υδραυλικός 24ωρος"],
    de: ["Sanitär Schmidt", "Klempner Fischer", "Sanitär & Heizung Bauer", "Installateur Müller", "Rohrmeister GmbH"],
    en: ["FlowPro Plumbing", "City Plumbers", "AquaFix Services", "Rapid Response Plumbing", "Pro Plumb Solutions"],
  },
  drain_cleaning: {
    el: ["Αποφράξεις Ολυμπία", "Αποφράξεις 24ωρες", "DrainClear GR", "Αποφράξεις Αθήνα", "Αποφράξεις Express"],
    de: ["Rohrreinigung Schnell", "Kanalreinigung Weber", "Rohrdienst 24h", "Abflussreinigung Profi", "Kanalservice GmbH"],
    en: ["DrainClear Services", "PipeFix Solutions", "24h Drain Services", "ClearFlow Drainage", "Rapid Drain Unblocking"],
  },
  carpenter: {
    el: ["Ξυλουργός Νίκος", "Έπιπλα & Κατασκευές", "WoodCraft GR", "Ξυλουργικές Εργασίες", "Κατασκευές Ξύλου"],
    de: ["Tischler Zimmermann", "Schreinerei Holz", "Tischlerei Meister", "Holzbau Fischer", "Möbelschreinerei Weber"],
    en: ["WoodCraft Carpentry", "CarpentryPro Services", "City Joinery", "Timber & Craft", "Master Carpenter Co."],
  },
  painter: {
    el: ["Ελαιοχρωματιστής Πέτρος", "Βαφές & Αλοιφές", "ColorPro GR", "Ελαιοχρωματισμοί", "Χρωματισμοί Αθήνα"],
    de: ["Malerbetrieb Farbe", "Malermeister Weiß", "Malerservice Bunt", "Maler & Lackierer", "Malerfachbetrieb GmbH"],
    en: ["PaintMaster Services", "ColorPro Painters", "City Decorators", "Precision Painting Co.", "ProPaint Solutions"],
  },
  locksmith: {
    el: ["Κλειδαράς Αντώνης", "24ωρος Κλειδαράς", "KeyMaster GR", "Κλειδαράς Άμεση Εξυπηρέτηση", "Κλειδαράς Κεντρικός"],
    de: ["Schlüsseldienst Schnell", "Schlüsselnotdienst", "Schlüsseldienst 24h", "Schlüsseldienst Meister", "Schlosser am Ort"],
    en: ["LockPro Services", "KeyMaster Locksmiths", "City Locksmith", "24h Lock & Key", "Rapid Response Locksmiths"],
  },
  security_systems: {
    el: ["Ασφάλεια & Κάμερες", "Alarm & CCTV GR", "SecureHome Athens", "Συστήματα Ασφαλείας", "SafeGuard GR"],
    de: ["Sicherheitstechnik Meyer", "Sicherheitssysteme GmbH", "Alarm & Kamera Service", "Sicherheit am Haus", "Schutztech GmbH"],
    en: ["SafeGuard Security", "SecureHome Systems", "City Security Solutions", "Alarm & CCTV Pro", "Shield Security Systems"],
  },
  moving: {
    el: ["Μεταφορές Ποσειδών", "Μετακομίσεις Αθήνα", "MoveEasy GR", "Μεταφορές & Μετακομίσεις", "Speed Μεταφορές"],
    de: ["Umzugsfirma Express", "Umzugsservice Schnell", "Umzug Profi GmbH", "Umzugshelfer München", "Transportservice Bauer"],
    en: ["EasyMove Services", "City Removals", "ProMove Solutions", "Swift Removals Co.", "Trusted Movers"],
  },
  computer_tech: {
    el: ["Τεχνικός Υπολογιστών Άρης", "Επισκευές Laptop & PC", "TechFix GR", "IT Service Athens", "PC Repair GR"],
    de: ["PC-Service Müller", "Computerreparatur Schmidt", "IT-Service Profi", "TechFix Berlin", "Computer & Laptop Reparatur"],
    en: ["TechFix IT Services", "DigiCare Solutions", "City Computer Repair", "ProTech IT Support", "PC Doctor"],
  },
  appliance_tech: {
    el: ["Τεχνικός Οικιακών", "Επισκευές Συσκευών", "ApplianceFix GR", "Τεχνικός Ηλεκτρικών", "Επισκευές 24ωρες"],
    de: ["Haushaltsgeräte Service", "Elektrohaushaltsgeräte Reparatur", "Gerätereparatur Profi", "Weißware Service GmbH", "Reparaturservice Bauer"],
    en: ["ApplianceFix Services", "FixPro Appliances", "City Appliance Repair", "Home Appliance Doctor", "Rapid Appliance Services"],
  },
  lawyer: {
    el: ["Δικηγορικό Γραφείο Σπύρου", "Νομική Εταιρεία Κόσμος", "Legal Partners GR", "Δικηγόρος Αθηνών", "Νομικές Υπηρεσίες"],
    de: ["Kanzlei Hoffmann", "Rechtsanwalt Weber", "Rechtsanwaltskanzlei Müller", "Advokatur Schmidt", "Anwaltskanzlei Bauer"],
    en: ["Legal Partners LLP", "City Solicitors", "Law Office Associates", "Chambers & Partners", "Highstreet Legal"],
  },
  accountant: {
    el: ["Λογιστικό Γραφείο Δήμου", "Κόσμος Λογιστική", "Finance Solutions GR", "Λογιστής Αθηνών", "Φορολογικές Υπηρεσίες"],
    de: ["Steuerberater Braun", "Wirtschaftsprüfer Koch", "Steuerbüro Müller", "Steuerberatung Schmidt", "Buchführung & Steuer"],
    en: ["Taxwise Accountants", "City Accountancy", "Finance Solutions Group", "ProAccounts Ltd", "Chartered Accountants Co."],
  },
  business_services: {
    el: ["Σύμβουλοι Επιχειρήσεων", "Επιχειρηματικές Λύσεις", "BizPro GR", "Business Consulting GR", "Στρατηγική Ανάπτυξη"],
    de: ["Unternehmensberatung GmbH", "Management Consulting", "Business Solutions GmbH", "Beratung & Strategie", "Unternehmensentwicklung"],
    en: ["BizPro Consulting", "Business Solutions Group", "City Business Services", "Strategy & Growth Ltd", "Enterprise Advisors"],
  },
  architect: {
    el: ["Αρχιτέκτονας Δημήτρης", "Αρχιτεκτονικό Γραφείο", "DesignBuild GR", "Αρχιτέκτονες & Μηχανικοί", "Studio Αρχιτεκτονική"],
    de: ["Architekturbüro Bauer", "Planungsbüro Müller", "Architekten & Partner", "Architektenstudio GmbH", "Bauplaner Architekten"],
    en: ["ArchiCraft Designs", "DesignBuild Associates", "City Architecture Studio", "Creative Architects", "Urban Design Partners"],
  },
  surveyor: {
    el: ["Τοπογράφος Νίκος", "Τοπογραφικές Υπηρεσίες", "GeoSurvey GR", "Μηχανικοί Τοπογράφοι", "Κτηματολόγιο & Τοπογραφία"],
    de: ["Vermessungsbüro Kern", "Geodätisches Büro", "Vermessungsingenieure GmbH", "Kataster & Vermessung", "Büro für Geomatik"],
    en: ["LandSurvey Solutions", "GeoSurvey Associates", "City Surveyors", "Chartered Surveyors Co.", "ProSurvey Ltd"],
  },
  insurance: {
    el: ["Ασφάλειες Παπαδόπουλος", "Ασφαλιστικό Γραφείο", "InsureNow GR", "Ασφαλιστικός Σύμβουλος", "Hellas Insurance"],
    de: ["Versicherungsbüro Sicher", "Versicherungsagentur GmbH", "Allianz Agentur Müller", "Versicherungsberater", "Schutz & Vorsorge GmbH"],
    en: ["SafeInsure Brokers", "City Insurance Solutions", "InsureNow Agency", "Trusted Insurance Group", "ProCover Advisors"],
  },
  car_mechanic: {
    el: ["Συνεργείο Αυτοκινήτων", "Μηχανικός Αυτοκινήτων Βασίλης", "AutoFix GR", "Αυτοκινητιστικό Κέντρο", "CarCare GR"],
    de: ["KFZ-Werkstatt Müller", "Autowerkstatt Bauer", "KFZ-Meister Schmidt", "Auto-Service Profi", "Kfz-Reparatur Zentrum"],
    en: ["AutoFix Garage", "CarCare Services", "City Auto Mechanics", "ProAuto Workshop", "Trusted Car Repairs"],
  },
  driving_school: {
    el: ["Σχολή Οδηγών Αλέξης", "Εκπαίδευση Οδηγών", "DriveRight GR", "Σχολή Οδηγών Κεντρική", "Μαθήματα Οδήγησης"],
    de: ["Fahrschule Zuverlässig", "Fahrschule Sicher", "Fahrschule am Zentrum", "Fahrausbildung Profi", "Fahrschule Müller"],
    en: ["RoadReady Driving School", "DriveRight Academy", "City Driving School", "Pass First Time Driving", "ProDrive Tuition"],
  },
  taxi: {
    el: ["Ταξί Αθήνα Express", "Μεταφορές VIP", "CityTaxi GR", "Ταξί 24ωρο", "Αθήνα Ταξί"],
    de: ["Taxiunternehmen Schnell", "Taxibetrieb Zuverlässig", "Taxi & Transfer GmbH", "Stadt-Taxi Service", "Taxi am Bahnhof"],
    en: ["CityTaxi Services", "AthensRide Transfer", "Express Taxi Co.", "ProRide Transport", "City Cab Services"],
  },
  beauty: {
    el: ["Κέντρο Ομορφιάς Ελένη", "Αισθητική & Ομορφιά", "BeautyLab GR", "Studio Ομορφιάς", "GlowUp Athens"],
    de: ["Kosmetikstudio Glamour", "Beauty Salon Schön", "Kosmetik & Wellness", "Studio Schönheit", "Beauty Center Elegance"],
    en: ["BeautyLab Studios", "GlowUp Beauty", "City Beauty Salon", "Luxe Beauty Centre", "The Beauty Studio"],
  },
  hair_salon: {
    el: ["Κομμωτήριο Ελένης", "Κομμώσεις Αφροδίτη", "Hair Studio GR", "Κομμωτήριο Στυλ", "Hair & Beauty GR"],
    de: ["Friseur Glamour", "Haarsalon Monika", "Friseursalon Schick", "Haarschnitt & Style", "Coiffeur Elegance"],
    en: ["Hair Studio Vogue", "Scissors & Style", "City Hair Salon", "The Hair Lounge", "Curl & Colour Studio"],
  },
  aesthetician: {
    el: ["Αισθητικός Μαρία", "Κέντρο Αισθητικής", "SkinCare GR", "Αισθητική Θεραπεία", "GlowSkin Athens"],
    de: ["Kosmetikerin Rose", "Hautpflegestudio", "Kosmetik & Pflege", "Schönheitspflege GmbH", "Institut für Ästhetik"],
    en: ["GlowSkin Aesthetics", "SkinCare Studio", "City Skin Clinic", "The Facial Bar", "Radiance Aesthetics"],
  },
  gym: {
    el: ["Γυμναστήριο Τιτάνας", "Power Gym GR", "FitZone Athens", "Κέντρο Γυμναστικής", "Olympia Gym"],
    de: ["FitnessFirst Berlin", "Sportcenter Olympia", "Fitnessstudio Kraft", "Sportzentrum GmbH", "FitLife Fitness"],
    en: ["Iron Body Gym", "FitZone Fitness", "City Gym & Fitness", "Power House Gym", "ProFit Training Centre"],
  },
  restaurant: {
    el: ["Ταβέρνα η Ελιά", "Εστιατόριο Ολύμπιο", "Ouzeri Piraeus", "Ταβέρνα Ακρόπολη", "Εστιατόριο Αθήνα"],
    de: ["Gasthaus Adler", "Wirtshaus zur Post", "Restaurant Zentrum", "Gasthof Sonne", "Restaurant am Markt"],
    en: ["The Crown Restaurant", "Bistro Central", "City Grill & Bar", "The Old Mill", "Harbour Kitchen"],
  },
  restaurant_tavernas: {
    el: ["Ταβέρνα Σαντορίνη", "Ουζερί Θεσσαλονίκη", "Ταβέρνα Ζορμπάς", "Εστιατόριο Μυκόνου", "Ταβέρνα Κρήτης"],
    de: ["Gasthaus zur Linde", "Wirtshaus am See", "Taverne Gemütlich", "Restaurant Alpenhof", "Gasthof am Berg"],
    en: ["The Tavern & Grill", "Harbour Taverna", "The Local Kitchen", "Stone & Table Restaurant", "Olive Garden Bistro"],
  },
  hotel: {
    el: ["Hotel Akropolis", "Grand Athens Hotel", "Boutique Hotel Elia", "Ξενοδοχείο Κεντρικό", "Athens City Hotel"],
    de: ["Hotel Müller", "Stadthotel am Markt", "Hotel Zentrum", "Hotel Bremer", "Gasthof & Hotel Sonne"],
    en: ["Grand City Hotel", "The Central Hotel", "Boutique Hotel Elia", "Heritage Hotel", "Premier Inn Central"],
  },
  boutique_hotel: {
    el: ["The Athens Nest", "Villa Athena Suites", "Boutique Hotel Elia", "Athens Design Hotel", "Μικρό Ξενοδοχείο"],
    de: ["Kleines Hotel Gemütlich", "Boutique Pension Rose", "Stadthotel Boutique", "Hotel am Altstadtring", "Boutique Hotel Mitte"],
    en: ["The Nest Boutique Hotel", "Heritage Hotel GR", "City Boutique Suites", "The Townhouse Hotel", "Little Gem Hotel"],
  },
  resort_hotel: {
    el: ["Mykonos Grand Resort", "Santorini Bliss Resort", "Blue Palace Resort", "Κρήτη Beach Resort", "Aegean Paradise Resort"],
    de: ["Hotel Resort Panorama", "Alpenresort Sonne", "Seeresort Wellness", "Resort & Spa GmbH", "Ferienresort Bayern"],
    en: ["The Grand Resort", "Coastal Paradise Resort", "Hilltop Resort & Spa", "Lakeside Resort Hotel", "Prestige Resort Group"],
  },
  villas: {
    el: ["Villa Kalypso", "Santorini Dream Villas", "Villa Poseidon Suites", "Ithaca Luxury Villas", "Κρήτη Villas"],
    de: ["Luxusvilla am See", "Exklusive Ferienvilla", "Villa Sonnenschein", "Ferienvilla Panorama", "Luxusvilla GmbH"],
    en: ["Luxury Villas Collection", "Dream Villa Rentals", "Prestige Villa Group", "Coastal Luxury Villas", "The Villa Company"],
  },
  short_term_rentals: {
    el: ["Athens Airbnb Central", "Cozy Studio Thessaloniki", "Santorini View Apartment", "Mykonos Holiday Flat", "GR City Apartments"],
    de: ["Ferienwohnung Berlin", "City Apartment Munich", "Ferienapartment Zentrum", "Kurzzeitmiete GmbH", "Ferienwohnung am Park"],
    en: ["City Short Stay", "Holiday Apartment Central", "Urban Flat Rentals", "Stay & Explore Apartments", "CozyStay Rentals"],
  },
  rooms_to_let: {
    el: ["Δωμάτια Κυρίας Μαρίας", "Studios Helios", "Ενοικιαζόμενα Δωμάτια", "Cozy Rooms GR", "Studios Aegean"],
    de: ["Zimmer Pension Alm", "Gästezimmer Sonnenhang", "Zimmer zu vermieten", "Pension am Berg", "Gästezimmer Zentrum"],
    en: ["Cozy Rooms B&B", "Studios to Let", "City Rooms Rental", "Budget Rooms Central", "Guest Rooms & Studios"],
  },
  guesthouses: {
    el: ["Guesthouse Athena", "Pension Eleni", "Ξενώνας Απόλλων", "B&B Hellas", "Ξενώνας Κεντρικός"],
    de: ["Pension Alpenhof", "Landpension Waldesruh", "Pension Sonnenschein", "Gasthaus Pension", "Familienpension GmbH"],
    en: ["Athena Guesthouse", "The B&B Corner", "City Guesthouse", "Cosy B&B Inn", "Parkside Guesthouse"],
  },
  agrotourism: {
    el: ["Αγροτουρισμός Κρήτης", "Farm Stay Πελοπόννησος", "Ελαιώνας Αγροτουρισμός", "Rural Retreat GR", "Αγροικία Ελλάς"],
    de: ["Bauernhof Urlaub", "Agritourismus GmbH", "Landurlaub Natur", "Bauernhofpension", "Agrotourismus Bayern"],
    en: ["Rural Retreat Farm", "Agrotourism Hellas", "Country Farm Stay", "Green Fields Agro", "Farm & Nature Escape"],
  },
  camping: {
    el: ["Camping Olympia", "Κάμπινγκ Παραλία", "Άγιος Νικόλαος Camping", "Beach Camping GR", "Naturcamp GR"],
    de: ["Campingplatz Seeblick", "Naturcamp Bayern", "Campingplatz am Wald", "Familiencamping GmbH", "Camping am Fluss"],
    en: ["Camping Meadows", "Lakeside Camping", "Beach Camping Ground", "ProCamp Sites", "Wild & Free Camping"],
  },
  glamping: {
    el: ["Glamping Santorini", "Luxury Tent Crete", "Glamping Peloponnese", "StarGaze Glamping GR", "EcoLuxe Camp GR"],
    de: ["Glamping am See", "Luxuscamping Bayern", "Safari Lodge Deutschland", "Naturotel Glamping", "Glamping & Natur GmbH"],
    en: ["Glamp & Glow", "Safari Lodge UK", "StarGaze Glamping", "EcoLuxe Retreats", "Wild Luxury Glamping"],
  },
  travel_agency: {
    el: ["Hermes Travel", "Greek Island Holidays", "Hellas Travel Agency", "Sunway Tours GR", "Ταξιδιωτικό Γραφείο"],
    de: ["Reisebüro Europa", "MedSun Reisen", "Sonnentours GmbH", "Reisebüro am Markt", "Traumreisen GmbH"],
    en: ["Sunway Travel", "City Travel Agency", "Horizon Travel Group", "World Tours & Holidays", "ProTravel Experts"],
  },
  tour_operator: {
    el: ["Athens Tours & Trips", "Greek Experience Tours", "Island Hopping GR", "OdysseyTours", "Discover Greece Tours"],
    de: ["Reiseveranstalter GmbH", "Griechenland Touren", "Erlebnis Touren GmbH", "Tour & Ausflug GmbH", "Stadtrundfahrten GmbH"],
    en: ["OdysseyTours", "City Explorer Tours", "Island Hopping Co.", "ProTour Operators", "Discover & Explore"],
  },
  transfers: {
    el: ["Athens Airport Transfer", "Island Transfers GR", "VIP Transfer Service", "EasyRide GR", "Αεροδρόμιο Transfer"],
    de: ["Flughafentransfer GmbH", "Transferservice GmbH", "Shuttle & Transfer", "Airport Shuttle Express", "Transferfahrten GmbH"],
    en: ["EasyRide Transfers", "Airport Express Transfer", "VIP Transfer Co.", "City Shuttle Service", "ProTransfer Group"],
  },
  football_club: {
    el: ["ΑΟ Αθήνα FC", "Olympiacos Youth", "Athens Athletic Club", "FC Poseidon", "Αθλητικός Σύλλογος"],
    de: ["FC Grünwald", "Sportverein GmbH", "Fußballclub am Ort", "TSV Sportfreunde", "SC Vereinsheim"],
    en: ["City FC", "United Athletic Club", "FC Rovers", "Town United FC", "Athletic Sports Club"],
  },
  personal_trainer: {
    el: ["Personal Trainer Κώστας", "FitCoach Athens", "Προσωπικός Γυμναστής", "BodyCoach GR", "PT Studio GR"],
    de: ["Personal Training Berlin", "Fitnesstrainer Pro", "Personal Coach GmbH", "Training & Fitness", "Body & Geist Coach"],
    en: ["BodyCoach Training", "FitCoach Personal Training", "ProPT Studio", "Peak Performance Training", "Elite Fitness Coaching"],
  },
  tennis_club: {
    el: ["Tennis Club Athens", "Αθλητικός Όμιλος Τένις", "Ρακέτα Αθλητικός", "Match Point GR", "Τένις Κεντρικός"],
    de: ["Tennisclub Olympia", "TC am Park", "Tennisverein GmbH", "Sportclub Tennis", "Tennis & Sport GmbH"],
    en: ["City Tennis Club", "Match Point Club", "Ace Tennis Centre", "ProTennis Academy", "Lawn Tennis Association"],
  },
  construction_engineering: {
    el: ["Τεχνική Κατασκευαστική", "Κατασκευές & Ανακαινίσεις", "BuildPro GR", "Οικοδομικές Εργασίες", "ConstructHellas"],
    de: ["Baufirma Müller GmbH", "Bauunternehmen Solid", "Bau & Renovierung GmbH", "Baumeister GmbH", "Hochbau & Tiefbau"],
    en: ["BuildPro Construction", "ConstructHellas Ltd", "City Build Group", "Solid Structure Ltd", "Pro Build Engineering"],
  },
  real_estate: {
    el: ["Μεσιτικό Ελλάδα", "Κτηματομεσιτική Αθήνα", "Athens Realty", "PropertyLink GR", "Κτηματομεσίτης"],
    de: ["Immobilien Schmidt", "Haus & Grund GmbH", "Immobilienbüro Müller", "Immobilienservice GmbH", "Wohnimmobilien GmbH"],
    en: ["PropertyLink Realty", "City Estates Agency", "Homes & Land Group", "ProProperty Solutions", "Urban Realty Partners"],
  },
  retail: {
    el: ["Κατάστημα Κεντρικό", "Εμπορικό Κατάστημα", "ShopZone GR", "Κατάστημα Αθήνα", "RetailPro GR"],
    de: ["Einzelhandel Meyer", "Geschäft am Markt", "Fachgeschäft GmbH", "Stadtladen GmbH", "Fachhandel Zentrum"],
    en: ["ShopZone Retail", "RetailPro Stores", "City Centre Shop", "ProShop Solutions", "The Trading Post"],
  },
  furniture: {
    el: ["Έπιπλα Αρχοντικό", "Κατάστημα Επίπλων", "FurnishHome GR", "Έπιπλα & Διακόσμηση", "HomeStyle GR"],
    de: ["Möbelhaus Gemütlich", "Möbel & Design GmbH", "Möbelgeschäft Wohn", "Einrichtungshaus GmbH", "Raumdesign Möbel"],
    en: ["HomeStyle Furniture", "FurnishHome Designs", "City Furniture Store", "Living & Design Co.", "The Furniture Gallery"],
  },
  florist: {
    el: ["Ανθοπωλείο Ανθή", "Λουλούδια & Δώρα", "Flower Shop GR", "Ανθοπωλείο Κεντρικό", "BloomFresh GR"],
    de: ["Blumenladen Rose", "Floristik Blüte", "Blumengeschäft GmbH", "Blumen am Markt", "Blumenatelier GmbH"],
    en: ["BloomFresh Florists", "The Flower Shop", "City Florist & Gifts", "Petals & Stems", "Rose Garden Florist"],
  },
  gas_station: {
    el: ["Βενζινάδικο Αθήνα", "Σταθμός Καυσίμων", "FuelStop GR", "Πρατήριο Καυσίμων", "PetrolPoint GR"],
    de: ["Tankstelle Schnell", "Tankstelle Zuverlässig", "Tankstelle am Ort", "Shell-Tankstelle GmbH", "Benzin & Service"],
    en: ["FuelStop Services", "PetrolPoint Station", "City Fuel & Go", "ProFuel Station", "AutoFuel Services"],
  },
  education: {
    el: ["Φροντιστήριο Αριστείας", "Εκπαιδευτικό Κέντρο", "EduCentre GR", "Φροντιστήριο Κεντρικό", "AcademyPro GR"],
    de: ["Bildungszentrum Wissen", "Lernzentrum GmbH", "Schule & Bildung GmbH", "Akademie am Ort", "Bildungshaus GmbH"],
    en: ["EduCentre Academy", "City Learning Centre", "AcademyPro Schools", "Knowledge Hub", "Futures Education"],
  },
  tutoring: {
    el: ["Φροντιστήριο Πυθαγόρας", "Φροντιστήριο Νέων", "TutorZone GR", "Ιδιαίτερα Μαθήματα", "SmartLearn GR"],
    de: ["Nachhilfeschule Clever", "Nachhilfe Erfolgreich", "Nachhilfe am Ort", "Lernhilfe GmbH", "Schülerhilfe Zentrum"],
    en: ["TutorZone Learning", "SmartLearn Tutoring", "City Tutor Services", "Top Marks Tutoring", "Ace Study Centre"],
  },
  language_school: {
    el: ["Κέντρο Ξένων Γλωσσών", "Γλωσσικό Κέντρο", "Language Hub GR", "Σχολή Γλωσσών", "PolyGlot GR"],
    de: ["Sprachschule International", "Sprachinstitut GmbH", "Fremdsprachen Zentrum", "Sprachkurse GmbH", "Institut für Sprachen"],
    en: ["PolyGlot Language School", "Language Hub Academy", "City Language Centre", "ProLingua School", "Global Languages Institute"],
  },
  photographer: {
    el: ["Φωτογράφος Μανώλης", "Φωτογραφικό Στούντιο", "CapturePro GR", "Φωτογράφος Αθηνών", "LensArt GR"],
    de: ["Fotograf Bild", "Fotostudio Licht", "Fotografenstudio GmbH", "Bild & Moment", "Fotograf am Ort"],
    en: ["LensArt Photography", "CapturePro Studios", "City Photographer", "Frame & Focus Studios", "Shutter Story Photography"],
  },
  videographer: {
    el: ["Βιντεογράφος Αλέξης", "Στούντιο Βίντεο", "VideoCreative GR", "Βίντεο Παραγωγή", "ReelArt GR"],
    de: ["Videoproduktion Film", "Filmproduktion Kreativ", "Videostudio GmbH", "Bild & Ton GmbH", "Filmwerk GmbH"],
    en: ["ReelArt Productions", "VideoCreative Studios", "City Videography", "Frame by Frame Films", "Motion Picture Pro"],
  },
  event_planner: {
    el: ["Οργάνωση Εκδηλώσεων", "Events GR", "CelebratePro Athens", "Εκδηλώσεις & Πάρτυ", "SpecialDay GR"],
    de: ["Eventplanung Festlich", "Eventservice Glanz", "Veranstaltungsservice GmbH", "Event & Feier GmbH", "Festlichkeiten GmbH"],
    en: ["SpecialDay Events", "CelebratePro Planning", "City Event Solutions", "Occasions Event Planners", "Grand Events Group"],
  },
  other: {
    el: ["Επιχείρηση Κεντρική", "Γενικές Υπηρεσίες", "Business Solutions GR", "Κεντρικές Υπηρεσίες", "ServicePro GR"],
    de: ["Dienstleistungen GmbH", "Allgemeine Dienstleistungen", "Service GmbH am Ort", "Dienstleistungszentrum", "Servicebetrieb GmbH"],
    en: ["ServicePro Solutions", "Business Solutions Group", "City Services Ltd", "General Services Co.", "ProService Group"],
  },
};

function getMockName(slug, lang) {
  const key  = slug.replace(/-/g, "_");
  const entry = MOCK_NAMES[key];
  if (entry) {
    const pool = entry[lang] || entry.en;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  // Generic fallback
  const label = subcatSel.options[subcatSel.selectedIndex]?.textContent?.replace(/^[^ ]+ /, "") || slug;
  const suffixes = ["Pro", "Plus", "Expert", "Center", "Services", "Solutions", "Group", "Team"];
  return label + " " + suffixes[Math.floor(Math.random() * suffixes.length)];
}

function randPhone(countryKey) {
  if (countryKey.includes("Greece") || countryKey.includes("Cyprus"))
    return "+30 " + (210 + Math.floor(Math.random()*89)) + " " + Math.floor(1000000+Math.random()*9000000);
  if (countryKey.includes("Germany"))
    return "+49 " + Math.floor(30+Math.random()*970) + " " + Math.floor(100000+Math.random()*9000000);
  if (countryKey.includes("Austria"))
    return "+43 " + Math.floor(1+Math.random()*99) + " " + Math.floor(100000+Math.random()*9000000);
  if (countryKey.includes("Switzerland"))
    return "+41 " + Math.floor(10+Math.random()*89) + " " + Math.floor(1000000+Math.random()*9000000);
  return "+44 " + Math.floor(100+Math.random()*899) + " " + Math.floor(1000000+Math.random()*9000000);
}

function randRating()  { return (3.4 + Math.random() * 1.6).toFixed(1); }
function randReviews() { return Math.floor(5 + Math.random() * 340); }
function randWebsite(name, countryKey) {
  if (!name || Math.random() < 0.3) return null;
  const tld = countryKey.includes("Germany") || countryKey.includes("Austria") ? ".de" :
              countryKey.includes("Switzerland") ? ".ch" :
              countryKey.includes("UK") ? ".co.uk" : ".gr";
  return "www." + name.toLowerCase().replace(/[^a-z]/g,"").slice(0,12) + tld;
}
function randEmail(name, countryKey) {
  if (Math.random() > 0.5) return null;
  const tld = countryKey.includes("Germany") || countryKey.includes("Austria") ? ".de" :
              countryKey.includes("Switzerland") ? ".ch" :
              countryKey.includes("United Kingdom") ? ".co.uk" :
              countryKey.includes("Cyprus") ? ".cy" : ".gr";
  return "info@" + name.toLowerCase().replace(/[^a-z]/g,"").slice(0,12) + tld;
}

function generateMockLeads(slug, city, countryKey, count = 18) {
  const lang = getLang(countryKey);
  return Array.from({ length: count }, (_, i) => {
    const name = getMockName(slug, lang);
    const website = randWebsite(name, countryKey);
    const email = website && Math.random() > 0.4 ? randEmail(name, countryKey) : null;
    const streetTemplates = {
      el: ["Οδός Αθηνάς 12", "Λεωφόρος Βουλιαγμένης 88", "Πανεπιστημίου 34", "Σταδίου 5", "Ερμού 21"],
      de: ["Hauptstraße 45", "Marktplatz 3", "Bahnhofstraße 12", "Schillerstraße 7", "Königsallee 88"],
      en: ["Main Street 7", "High Street 15", "Church Road 4", "Victoria Avenue 22", "Park Lane 9"],
    };
    const streets = streetTemplates[lang] || streetTemplates.en;
    return {
      id: i + 1,
      name: name + (i > 5 ? ` ${i - 4}` : ""),
      phone: Math.random() > 0.15 ? randPhone(countryKey) : null,
      website, email,
      rating: parseFloat(randRating()),
      reviews: randReviews(),
      address: city + ", " + streets[Math.floor(Math.random()*streets.length)],
      status: ["new","new","new","contacted","saved"][Math.floor(Math.random()*5)],
    };
  });
}

/* ── State ───────────────────────────────────────────── */
let results      = [];
let viewMode     = "grid";
let currentPage  = 1;
let currentLang  = "en";
let searchesLeft = null;
const PER_PAGE   = 12;

// Lead scoring state
let scoreMap    = {};  // key: "name|city" -> { score, tier, reasoning }
let scoreFilter = "all";
let sortByScore = true;
let scoresDone  = false;

/* ── DOM refs ────────────────────────────────────────── */
const panelTitle  = document.getElementById("lf-panel-title");
const labelCountry= document.getElementById("lf-label-country");
const labelCity   = document.getElementById("lf-label-city");
const labelCat    = document.getElementById("lf-label-cat");
const labelSubcat = document.getElementById("lf-label-subcat");
const labelRadius = document.getElementById("lf-label-radius");

const countrySel  = document.getElementById("lf-country");
const citySel     = document.getElementById("lf-city");
const mainCatSel  = document.getElementById("lf-main-cat");
const subcatSel   = document.getElementById("lf-subcat");
const subcatWrap  = document.getElementById("lf-subcat-wrap");
const radiusSlider= document.getElementById("lf-radius");
const radiusVal   = document.getElementById("lf-radius-val");
const searchBtn   = document.getElementById("lf-search-btn");
const clearBtn    = document.getElementById("lf-clear-btn");
const resultsArea = document.getElementById("lf-results-area");
const resultsBar  = document.getElementById("lf-results-bar");
const countEl     = document.getElementById("lf-count");
const emailOnlyChk= document.getElementById("lf-email-only");
const filterWrapper= document.getElementById("lf-filter-wrapper");
const gridBtn     = document.getElementById("lf-grid-btn");
const listBtn     = document.getElementById("lf-list-btn");
const exportBtn   = document.getElementById("lf-export-btn");

function syncFilterWrapper() {
  if (!filterWrapper) return;
  filterWrapper.classList.toggle("expanded", !!(emailOnlyChk && emailOnlyChk.checked) || resultsBar.style.display !== "none");
}

/* ── Apply i18n labels ───────────────────────────────── */
function applyLang(lang) {
  currentLang = lang;
  const t = I18N[lang] || I18N.en;
  panelTitle.textContent  = t.panelTitle;
  labelCountry.textContent = t.labelCountry;
  labelCity.textContent    = t.labelCity;
  labelCat.textContent     = t.labelCat;
  labelSubcat.textContent  = t.labelSubcat;
  labelRadius.textContent  = t.labelRadius;
  searchBtn.textContent    = t.searchBtn;
  clearBtn.textContent     = t.clearBtn;

  // update placeholder options
  countrySel.options[0].textContent = t.placeholderCountry;
  citySel.options[0] && (citySel.options[0].textContent = t.placeholderCity);
  mainCatSel.options[0] && (mainCatSel.options[0].textContent = t.placeholderCat);
  subcatSel.options[0] && (subcatSel.options[0].textContent = t.placeholderSubcat);

  if (!results.length) resultsArea.innerHTML = emptyHTML();
}

/* ── Build country select ────────────────────────────── */
Object.keys(COUNTRIES).forEach(c => {
  const o = document.createElement("option");
  o.value = c; o.textContent = c;
  countrySel.appendChild(o);
});

countrySel.addEventListener("change", () => {
  const lang = getLang(countrySel.value);
  applyLang(lang);

  // populate cities
  const cities = COUNTRIES[countrySel.value] || [];
  const t = I18N[lang];
  citySel.innerHTML = `<option value="">${t.placeholderCity}</option>`;
  cities.forEach(city => {
    const o = document.createElement("option");
    o.value = city; o.textContent = city;
    citySel.appendChild(o);
  });
  citySel.disabled = cities.length === 0;

  // enable category now that country is chosen
  mainCatSel.disabled = cities.length === 0;
  if (cities.length === 0) {
    mainCatSel.value = "";
    subcatSel.innerHTML = `<option value="">${t.placeholderSubcat}</option>`;
    subcatWrap.classList.remove("visible");
  }
});

/* ── Build category select ───────────────────────────── */
CATEGORIES.forEach(g => {
  const opt = document.createElement("option");
  opt.value = g.slug;
  opt.textContent = `${g.icon} ${g.name}`;
  mainCatSel.appendChild(opt);
});

mainCatSel.addEventListener("change", () => {
  const g = CATEGORIES.find(c => c.slug === mainCatSel.value);
  const t = I18N[currentLang] || I18N.en;
  subcatSel.innerHTML = `<option value="">${t.placeholderSubcat}</option>`;
  if (g) {
    g.sub.forEach(s => {
      const o = document.createElement("option");
      o.value = s.slug; o.textContent = `${s.icon} ${s.name}`;
      subcatSel.appendChild(o);
    });
    subcatWrap.classList.add("visible");
    if (g.sub.length === 1) subcatSel.value = g.sub[0].slug;
  } else {
    subcatWrap.classList.remove("visible");
  }
});

/* ── Radius slider ───────────────────────────────────── */
radiusSlider.addEventListener("input", () => {
  const km = parseInt(radiusSlider.value);
  radiusVal.textContent = km < 1 ? `${km * 1000}m` : `${km} km`;
});

/* ── Search ──────────────────────────────────────────── */
searchBtn.addEventListener("click", doSearch);

function doSearch() {
  const t = I18N[currentLang] || I18N.en;
  const country = countrySel.value;
  const city    = citySel.value;
  const mainCat = mainCatSel.value;
  const subCat  = subcatSel.value;

  if (!country) { flash(countrySel, t.validCountry); return; }
  if (!city)    { flash(citySel,    t.validCity);    return; }
  if (!mainCat) { flash(mainCatSel, t.validCat);     return; }
  if (!subCat)  { flash(subcatSel,  t.validSubcat);  return; }

  // Credit gate
  if (searchesLeft !== null && searchesLeft !== -1 && searchesLeft <= 0) {
    openGate();
    return;
  }

  searchBtn.disabled = true;
  searchBtn.textContent = t.searching;
  resultsBar.style.display = "none"; syncFilterWrapper();
  showLoading(subCat, city, t);

  setTimeout(async () => {
    try {
      results = generateMockLeads(subCat, city, country, 18);
      currentPage  = 1;
      scoreMap     = {};
      scoreFilter  = "all";
      sortByScore  = true;
      scoresDone   = false;
      renderResults();
      resultsBar.style.display = "flex"; syncFilterWrapper();
      const subName = subcatSel.options[subcatSel.selectedIndex]?.textContent || subCat;
      countEl.innerHTML = `<strong>${results.length}</strong> leads · <strong>${subName}</strong> · <strong>${city}</strong>`;
      await deductCredit(results.length);
      triggerScoring(); // non-blocking — skeletons already shown
    } catch (err) {
      console.error("Search error:", err);
      resultsArea.innerHTML = emptyHTML();
      resultsBar.style.display = "none"; syncFilterWrapper();
    } finally {
      searchBtn.disabled = false;
      searchBtn.textContent = t.searchBtn;
    }
  }, 1400);
}

function flash(el, msg) {
  el.style.borderColor = "#ef4444";
  el.style.boxShadow = "0 0 0 3px rgba(239,68,68,0.15)";
  showToast(msg);
  setTimeout(() => { el.style.borderColor = ""; el.style.boxShadow = ""; }, 1800);
}

/* ── Loading ─────────────────────────────────────────── */
function showLoading(slug, city, t) {
  const subName = subcatSel.options[subcatSel.selectedIndex]?.textContent || slug;
  resultsArea.innerHTML = `
    <div class="lf-loading">
      <div class="lf-spinner"></div>
      <div class="lf-loading-text">${subName} in ${city}…</div>
      <div class="lf-loading-sub">${t.loadingSub}</div>
    </div>`;
}

/* ── Render results ──────────────────────────────────── */
function renderResults() {
  const city = citySel.value;

  // Build filtered + sorted display list
  let display = [...results];
  if (emailOnlyChk && emailOnlyChk.checked) {
    display = display.filter(l => !!(l.email || "").trim());
  }
  if (scoreFilter !== "all") {
    display = display.filter(l => scoreMap[scoreKey(l.name, city)]?.tier === scoreFilter);
  }
  if (sortByScore) {
    display.sort((a, b) => {
      const sA = scoreMap[scoreKey(a.name, city)]?.score ?? -1;
      const sB = scoreMap[scoreKey(b.name, city)]?.score ?? -1;
      return sB - sA;
    });
  }

  const total = display.length;
  const start = (currentPage - 1) * PER_PAGE;
  const page  = display.slice(start, start + PER_PAGE);

  let html = scoreBarHTML(city);
  if (viewMode === "grid") {
    html += `<div class="lf-grid">${page.map((l, i) => cardHTML(l, i)).join("")}</div>`;
  } else {
    html += `<div class="lf-list">${page.map((l, i) => rowHTML(l, i)).join("")}</div>`;
  }
  resultsArea.innerHTML = html;
  renderPagination(total);
  bindCardActions();
  bindScoreBar();
}

function cardHTML(l, i) {
  const subIcon = subcatSel.options[subcatSel.selectedIndex]?.textContent?.split(" ")[0] || "🏢";
  const dot     = l.status === "contacted" ? "dot-contacted" : l.status === "saved" ? "dot-saved" : "dot-new";
  const city    = citySel.value;
  const s       = scoreMap[scoreKey(l.name, city)];
  const delay   = scoresDone ? "" : `style="animation-delay:${i*40}ms"`;

  let scoreBadgeHTML;
  if (s) {
    scoreBadgeHTML = `<div class="lead-score-badge tier-${s.tier}" title="${esc(s.reasoning || "")}">${scoreTierIcon(s.tier)} ${s.score}</div>`;
  } else {
    scoreBadgeHTML = `<div class="lead-score-badge loading"><span class="score-skel"></span></div>`;
  }

  return `
  <div class="lead-card" data-id="${l.id}" ${delay}>
    <div class="lead-status-dot ${dot}"></div>
    <div class="lead-card-top">
      <div class="lead-card-icon">${subIcon}</div>
      <div class="lead-card-name">${esc(l.name)}</div>
      <div class="lead-card-top-right">
        ${scoreBadgeHTML}
        <div class="lead-card-rating">★ ${l.rating} <span style="color:var(--muted);font-weight:400">(${l.reviews})</span></div>
      </div>
    </div>
    <div class="lead-card-meta">
      ${l.address ? `<div class="lead-card-row"><span class="ico">📍</span>${esc(l.address)}</div>` : ""}
      ${l.phone   ? `<div class="lead-card-row"><span class="ico">📞</span>${esc(l.phone)}</div>` : ""}
      ${l.website ? `<div class="lead-card-row"><span class="ico">🌐</span><a href="https://${l.website}" target="_blank">${esc(l.website)}</a></div>` : ""}
    </div>
    <div class="lead-card-tags">
      ${l.phone   ? `<span class="lead-tag tag-has-phone">Has Phone</span>` : ""}
      ${l.website ? `<span class="lead-tag tag-has-web">Has Website</span>` : ""}
      ${l.email   ? `<span class="lead-tag tag-has-email">Has Email</span>` : `<span class="lead-tag tag-no-email">No Email</span>`}
      <span class="lead-tag tag-reviews">${l.reviews} reviews</span>
    </div>
    <div class="lead-card-actions">
      <button class="lc-btn primary" data-action="save" data-id="${l.id}">💾 Save</button>
      <button class="lc-btn" data-action="crm" data-id="${l.id}">➕ CRM</button>

      ${l.website ? `<button class="lc-btn" data-action="open" data-url="${l.website}">↗</button>` : ""}
    </div>
  </div>`;
}

function rowHTML(l, i) {
  const subIcon = subcatSel.options[subcatSel.selectedIndex]?.textContent?.split(" ")[0] || "🏢";
  return `
  <div class="lead-row" data-id="${l.id}" style="animation-delay:${i*30}ms">
    <div class="lr-icon">${subIcon}</div>
    <div><div class="lr-name">${esc(l.name)}</div><div class="lr-cat">${esc(l.address)}</div></div>
    <div class="lr-phone">${l.phone ? esc(l.phone) : "—"}</div>
    <div class="lr-web">${l.website ? `<a href="https://${l.website}" target="_blank">${esc(l.website)}</a>` : "—"}</div>
    <div class="lr-rating">★ ${l.rating}</div>
    <div class="lr-actions">
      <button class="lr-btn" data-action="save" data-id="${l.id}">Save</button>
      ${l.website ? `<button class="lr-btn" data-action="open" data-url="${l.website}">Visit</button>` : ""}
    </div>
  </div>`;
}

function renderPagination(total) {
  const pages = Math.ceil((total ?? results.length) / PER_PAGE);
  if (pages <= 1) return;
  const container = document.createElement("div");
  container.className = "lf-pagination";
  for (let p = 1; p <= pages; p++) {
    const btn = document.createElement("button");
    btn.className = "lf-page-btn" + (p === currentPage ? " active" : "");
    btn.textContent = p;
    btn.addEventListener("click", () => { currentPage = p; renderResults(); });
    container.appendChild(btn);
  }
  resultsArea.appendChild(container);
}

/* ── Card actions ────────────────────────────────────── */
function bindCardActions() {
  resultsArea.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const { action, id, url } = btn.dataset;
      const lead = results.find(r => r.id == id);
      if (!lead) return;
      if (action === "save") {
        addLeadToCrm(lead, btn, true);
      } else if (action === "crm") {
        addLeadToCrm(lead, btn, false);
      } else if (action === "audit") {
        showToast("AI Audit — coming with Pro plan");
      } else if (action === "open" && url) {
        window.open("https://" + url, "_blank");
      }
    });
  });
}

/* ── Add to CRM ──────────────────────────────────────── */
async function addLeadToCrm(lead, btn, savedMode = false) {
  const city     = citySel.value;
  const subLabel = subcatSel.options[subcatSel.selectedIndex]?.textContent?.replace(/^[^ ]+ /, "") || "";
  btn.disabled = true;
  btn.textContent = "…";
  const resetLabel = savedMode ? "💾 Save" : "➕ CRM";
  try {
    const res = await fetch("/api/crm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadName:     lead.name,
        businessType: subLabel,
        city:         city,
        phone:        lead.phone    || null,
        website:      lead.website  || null,
        email:        lead.email    || null,
        notes:        "",
      }),
    });
    if (res.ok) {
      btn.textContent = savedMode ? "✓ Saved" : "✓ Added";
      showToast(savedMode ? `${lead.name} saved to CRM` : `${lead.name} added to CRM`);
    } else if (res.status === 401) {
      btn.disabled = false;
      btn.textContent = resetLabel;
      showToast("Sign in to save leads to CRM");
    } else if (res.status === 409) {
      btn.textContent = "✓ Already in CRM";
    } else {
      btn.disabled = false;
      btn.textContent = resetLabel;
      showToast("Failed to add to CRM");
    }
  } catch {
    btn.disabled = false;
    btn.textContent = resetLabel;
    showToast("Failed to add to CRM");
  }
}


/* ── View toggle ─────────────────────────────────────── */
gridBtn.addEventListener("click", () => { viewMode = "grid"; gridBtn.classList.add("active"); listBtn.classList.remove("active"); if (results.length) renderResults(); });
listBtn.addEventListener("click", () => { viewMode = "list"; listBtn.classList.add("active"); gridBtn.classList.remove("active"); if (results.length) renderResults(); });
if (emailOnlyChk) emailOnlyChk.addEventListener("change", () => { currentPage = 1; syncFilterWrapper(); renderResults(); });

/* ── Clear ───────────────────────────────────────────── */
clearBtn.addEventListener("click", () => {
  results = []; currentPage = 1;
  scoreMap = {}; scoreFilter = "all"; sortByScore = true; scoresDone = false;
  countrySel.value = "";
  citySel.innerHTML = `<option value="">— Select city —</option>`;
  citySel.disabled = true;
  mainCatSel.value = ""; mainCatSel.disabled = true;
  subcatSel.innerHTML = `<option value="">— Select service —</option>`;
  subcatWrap.classList.remove("visible");
  radiusSlider.value = 5; radiusVal.textContent = "5 km";
  resultsBar.style.display = "none"; syncFilterWrapper();
  applyLang("en");
  resultsArea.innerHTML = emptyHTML();
});

/* ── Export CSV ──────────────────────────────────────── */
exportBtn.addEventListener("click", () => {
  if (!results.length) return;
  const rows = [["Name","Phone","Website","Email","Rating","Reviews","Address","Status"]];
  results.forEach(l => rows.push([l.name, l.phone||"", l.website||"", l.email||"", l.rating, l.reviews, l.address, l.status]));
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  a.download = `eureach-leads-${Date.now()}.csv`;
  a.click();
  showToast("CSV exported");
});

/* ── Toast ───────────────────────────────────────────── */
function showToast(msg) {
  const t = document.createElement("div");
  t.style.cssText = "position:fixed;bottom:24px;right:24px;z-index:999;background:#1e293b;border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:10px 18px;font-size:0.85rem;color:#e2e8f0;box-shadow:0 8px 32px rgba(0,0,0,0.4);opacity:0;transition:opacity 0.2s;";
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.style.opacity = "1");
  setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 250); }, 2500);
}

function emptyHTML() {
  const t = I18N[currentLang] || I18N.en;
  return `<div class="lf-empty">
    <div class="lf-empty-icon">🔍</div>
    <div class="lf-empty-title">${t.emptyTitle}</div>
    <div class="lf-empty-sub">${t.emptySub}</div>
  </div>`;
}

function esc(s) { const d = document.createElement("div"); d.textContent = String(s||""); return d.innerHTML; }

/* ── Credits ─────────────────────────────────────────── */
const navLeft        = document.getElementById("nav-searches-left");
const creditsRemEl   = document.getElementById("lf-credits-remaining");
const creditCostEl   = document.getElementById("lf-credit-cost");

let searchesMax  = null;
let searchReset  = null;

async function loadCredits() {
  try {
    const res  = await fetch("/api/auth/me");
    if (!res.ok) { setCreditsDisplay(null, null, null); return; }
    const { user } = await res.json();
    setCreditsDisplay(user ? user.searchesLeft : null, user ? user.searchesMax : null, user ? user.resetDate : null);
  } catch { setCreditsDisplay(null, null, null); }
}

function setCreditsDisplay(left, max, resetDate) {
  searchesLeft = left;
  searchesMax  = max;
  searchReset  = resetDate;
  const unlimited = left === -1;
  if (navLeft) navLeft.textContent = unlimited ? "∞" : left === null ? "—" : left;

  let label;
  if (unlimited)        label = "Unlimited searches";
  else if (left === null) label = "— remaining";
  else if (max !== null && max !== -1) {
    const used = max - left;
    label = `${used} / ${max} used${resetDate ? ` · Resets ${resetDate}` : ""}`;
  } else {
    label = `${left} remaining`;
  }
  if (creditsRemEl) creditsRemEl.textContent = label;

  const out = left !== null && !unlimited && left <= 0;
  if (creditCostEl) creditCostEl.classList.toggle("out-of-credits", out);
  searchBtn.classList.toggle("lf-search-btn-disabled", out);
}

function openGate() {
  document.getElementById("lf-gate-overlay").classList.add("open");
  document.getElementById("lf-gate-modal").classList.add("open");
}
function closeGate() {
  document.getElementById("lf-gate-overlay").classList.remove("open");
  document.getElementById("lf-gate-modal").classList.remove("open");
}
document.getElementById("lf-gate-overlay").addEventListener("click", closeGate);

async function deductCredit(leadsCount) {
  try {
    const res  = await fetch("/api/leads/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadsFound: leadsCount }),
    });
    const data = await res.json();
    if (res.ok) {
      setCreditsDisplay(data.searchesLeft, data.searchesMax, data.resetDate);
      // Show nudge if at 80%+ usage
      if (data.searchesMax > 0 && data.searchesLeft !== -1) {
        const used = data.searchesMax - data.searchesLeft;
        if (used / data.searchesMax >= 0.8) showNudgeBanner();
      }
    } else if (res.status === 403 && data.error === "limit_reached") {
      openGate();
    }
  } catch {}
}

function showNudgeBanner() {
  const existing = document.getElementById("lf-nudge-banner");
  if (existing) return;
  const banner = document.createElement("div");
  banner.id = "lf-nudge-banner";
  banner.innerHTML = `<span>⚡ You've used 80%+ of your free searches. <a href="membership.html">Upgrade to keep finding leads →</a></span><button onclick="this.parentElement.remove()">✕</button>`;
  banner.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:9999;background:linear-gradient(90deg,#7c3aed,#2563eb);color:#fff;display:flex;align-items:center;justify-content:center;gap:16px;padding:10px 20px;font-size:0.85rem;";
  banner.querySelector("a").style.cssText = "color:#fff;font-weight:700;text-decoration:underline;";
  banner.querySelector("button").style.cssText = "background:none;border:none;color:#fff;cursor:pointer;font-size:1rem;opacity:0.7;margin-left:8px;";
  document.body.prepend(banner);
}

/* ── Lead Scoring ────────────────────────────────────── */
function scoreKey(name, city) {
  return `${(name||"").trim().toLowerCase()}|${(city||"").trim().toLowerCase()}`;
}

function scoreTierIcon(tier) {
  return tier === "hot" ? "🔥" : tier === "warm" ? "🌡" : "❄";
}

async function triggerScoring() {
  if (!results.length) return;
  const city     = citySel.value;
  const subLabel = subcatSel.options[subcatSel.selectedIndex]?.textContent?.replace(/^[^ ]+ /, "") || "";

  const leadsPayload = results.map(l => ({
    name:           l.name,
    businessType:   subLabel,
    city:           city,
    website:        l.website     || null,
    phone:          l.phone       || null,
    rating:         l.rating,
    reviewCount:    l.reviews,
    lastReviewDate: null,
  }));

  try {
    const res = await fetch("/api/leads/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leads: leadsPayload }),
    });
    if (!res.ok) return; // not logged in or error — skip silently
    const data = await res.json();
    for (const sl of (data.leads || [])) {
      if (sl.score !== null && sl.score !== undefined) {
        scoreMap[scoreKey(sl.name, city)] = {
          score:     sl.score,
          tier:      sl.tier,
          reasoning: sl.reasoning || "",
        };
      }
    }
    scoresDone = true;
    currentPage = 1; // reset to page 1 so sort-by-score shows the best leads
    renderResults();
  } catch {}
}

function scoreBarHTML(city) {
  const hot  = results.filter(l => scoreMap[scoreKey(l.name, city)]?.tier === "hot").length;
  const warm = results.filter(l => scoreMap[scoreKey(l.name, city)]?.tier === "warm").length;
  const cold = results.filter(l => scoreMap[scoreKey(l.name, city)]?.tier === "cold").length;

  const fb = (id, label, count) => {
    const active = scoreFilter === id ? " active" : "";
    const cnt    = scoresDone && count > 0 ? ` <span class="lf-filter-count">${count}</span>` : "";
    return `<button class="lf-filter-btn${active}" data-filter="${id}">${label}${cnt}</button>`;
  };

  const sortLabel = sortByScore ? "↓ Score" : "↕ Original";

  return `
  <div class="lf-score-bar">
    <div class="lf-filter-group">
      ${fb("all",  "All",       results.length)}
      ${fb("hot",  "🔥 Hot",    hot)}
      ${fb("warm", "🌡 Warm",   warm)}
      ${fb("cold", "❄ Cold",   cold)}
    </div>
    <button class="lf-sort-btn" id="lf-sort-btn">${sortLabel}</button>
  </div>`;
}

function bindScoreBar() {
  resultsArea.querySelectorAll("[data-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      scoreFilter = btn.dataset.filter;
      currentPage = 1;
      renderResults();
    });
  });
  const sortBtn = document.getElementById("lf-sort-btn");
  if (sortBtn) sortBtn.addEventListener("click", () => {
    sortByScore = !sortByScore;
    currentPage = 1;
    renderResults();
  });
}

/* ── Init ────────────────────────────────────────────── */
resultsArea.innerHTML = emptyHTML();
loadCredits();
