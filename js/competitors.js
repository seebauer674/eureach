/* ── eureach.eu — Competitor Tracker ──────────────────── */

let competitors = [];
let currentSearchResults = [];
let currentSearchLabel   = "";

/* ── Categories (same as lead finder) ───────────────── */
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
    { icon:"🪚", name:"Carpenters", slug:"carpenter" },
    { icon:"🎨", name:"Painters", slug:"painter" },
    { icon:"🔑", name:"Locksmiths", slug:"locksmith" },
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
    { icon:"🏡", name:"Villas & Luxury Rentals", slug:"villas" },
    { icon:"🏠", name:"Airbnb / Short-term Rentals", slug:"short-term-rentals" },
  ]},
  { icon:"✈️", name:"Travel & Tourism", slug:"travel", sub:[
    { icon:"✈️", name:"Travel Agencies", slug:"travel-agency" },
    { icon:"🗺️", name:"Tour Operators", slug:"tour-operator" },
  ]},
  { icon:"🏗️", name:"Construction & Real Estate", slug:"construction", sub:[
    { icon:"🏗️", name:"Construction Companies", slug:"construction-engineering" },
    { icon:"🏠", name:"Real Estate Agencies", slug:"real-estate" },
  ]},
  { icon:"🛒", name:"Retail & Commerce", slug:"retail", sub:[
    { icon:"🛒", name:"Retail Stores", slug:"retail" },
    { icon:"💐", name:"Florists", slug:"florist" },
  ]},
  { icon:"📚", name:"Education", slug:"education", sub:[
    { icon:"📚", name:"Schools & Education", slug:"education" },
    { icon:"🎓", name:"Language Schools", slug:"language-school" },
  ]},
  { icon:"📷", name:"Creative & Events", slug:"creative", sub:[
    { icon:"📷", name:"Photographers", slug:"photographer" },
    { icon:"🎉", name:"Event Planners", slug:"event-planner" },
  ]},
];

const COUNTRIES = {
  "🇬🇷 Greece":         ["Athens", "Thessaloniki", "Patras", "Heraklion", "Rhodes", "Chania", "Larissa", "Volos", "Ioannina", "Kavala", "Corfu", "Kalamata", "Santorini", "Mykonos", "Nafplio"],
  "🇩🇪 Germany":        ["Berlin", "Munich", "Hamburg", "Cologne", "Frankfurt", "Stuttgart", "Düsseldorf", "Leipzig", "Dortmund", "Essen", "Bremen", "Dresden", "Hannover", "Nuremberg", "Bonn"],
  "🇦🇹 Austria":        ["Vienna", "Graz", "Linz", "Salzburg", "Innsbruck", "Klagenfurt", "Villach", "Wels", "Sankt Pölten", "Dornbirn"],
  "🇨🇭 Switzerland":    ["Zurich", "Geneva", "Basel", "Bern", "Lausanne", "Winterthur", "Lucerne", "St. Gallen", "Lugano", "Biel"],
  "🇬🇧 United Kingdom": ["London", "Birmingham", "Manchester", "Glasgow", "Leeds", "Liverpool", "Sheffield", "Edinburgh", "Bristol", "Cardiff"],
  "🇨🇾 Cyprus":         ["Nicosia", "Limassol", "Larnaca", "Paphos", "Famagusta", "Kyrenia"],
};

/* ── Mock business names per slug ────────────────────── */
const MOCK_NAMES = {
  doctor:               { el:["Ιατρείο Παπαδόπουλου","Κλινική Αγία Σοφία","Πολυϊατρείο Αθηνών","Ιατρείο Γεωργίου","Κλινική Υγεία"], de:["Dr. Müller Praxis","Hausarztpraxis Schneider","Allgemeinmedizin Bauer","Arztpraxis Weber","Gemeinschaftspraxis Koch"], en:["City Medical Centre","Dr. Smith & Partners","Highstreet Medical","Central Health Clinic","Family Doctor Practice"] },
  dentist:              { el:["Οδοντιατρείο Νικολάου","Κλινική Χαμόγελο","Dental Clinic Athens","Smile Studio GR","Οδοντίατρος Κώστας"], de:["Zahnarzt Fischer","Dental Studio Weiß","Zahnarztpraxis Müller","Zahnarzt am Markt","Moderne Zahnarztpraxis"], en:["SmileCare Dental","Perfect Teeth Clinic","City Dental Centre","Bright Smile Dentistry","Family Dental Practice"] },
  physiotherapist:      { el:["Φυσικοθεραπευτήριο Αλέξη","Κινησιοθεραπεία Νίκου","PhysioCenter Athens","Κέντρο Αποκατάστασης","RehabCare GR"], de:["Praxis für Physiotherapie Bauer","PhysioFit Schmidt","Physiotherapie Zentrum","Krankengymnastik Hoffmann","PhysioTeam München"], en:["PhysioPlus Clinic","ActiveCare Physio","City Physiotherapy","Movement Health Centre","RehabCare Physio"] },
  psychologist:         { el:["Ψυχολόγος Δήμητρα","Θεραπευτήριο Ψυχής","Mind & Wellness GR","Ψυχολογικό Κέντρο","Counseling Athens"], de:["Psychologische Praxis Koch","Praxis Seelenwohl","Psychotherapie Zentrum","Psychologe Müller","Institut für Psychologie"], en:["Mind & Wellness Centre","Counseling Partners","City Psychology Clinic","Mindful Therapy Group","Wellbeing Practice"] },
  pharmacy:             { el:["Φαρμακείο Γεωργίου","Φαρμακείο Ακρόπολη","Φαρμακείο Κεντρικό","City Pharmacy GR","Φαρμακείο 24ωρο"], de:["Apotheke Zentral","Stadtapotheke Müller","Apotheke am Markt","Rats-Apotheke","Löwen-Apotheke"], en:["Central Pharmacy","HealthPlus Pharmacy","City Chemist","Well Pharmacy","Boots Pharmacy"] },
  optician:             { el:["Οπτικά Βασίλη","Κέντρο Όρασης","VisionCare GR","Οπτικά Αθηνών","Οπτικά Κεντρικά"], de:["Optik Schneider","Augenoptik Weber","Brillen & Kontaktlinsen","Optiker am Marktplatz","Sehzentrum Müller"], en:["VisionCare Opticians","ClearSight Opticians","Eye Care Centre","The Optical Shop","Specsavers City"] },
  veterinarian:         { el:["Κτηνιατρείο Σταύρου","Ζωοφιλική Κλινική","PetCare GR","Animal Clinic GR","Κτηνιατρείο Αθηνών"], de:["Tierarztpraxis Braun","Tierarzt am Markt","Kleintierpraxis Müller","Tierärztliche Gemeinschaftspraxis","Tierklinik Zentrum"], en:["City Vet Clinic","PetCare Veterinary","Animal Health Centre","VetPlus Practice","The Veterinary Surgery"] },
  electrician:          { el:["Ηλεκτρολόγος Κώστας","Αδελφοί Ηλεκτρολόγοι","PowerFix GR","Ηλεκτρολόγος Νίκος","Ηλεκτρολογικές Εγκαταστάσεις"], de:["Elektro Müller GmbH","Elektromeister Bauer","Elektroservice Schneider","Elektrotechnik Weber","Elektro am Haus"], en:["PowerFix Electrical","VoltPro Services","City Electrician","Bright Spark Electrical","ProElectric Solutions"] },
  plumber:              { el:["Υδραυλικός Γιάννης","Αδελφοί Υδραυλικοί","AquaFix GR","Υδραυλικός 24ωρος","Υδραυλικές Εγκαταστάσεις"], de:["Sanitär Schmidt","Klempner Fischer","Sanitär & Heizung Bauer","Installateur Müller","Rohrmeister GmbH"], en:["FlowPro Plumbing","City Plumbers","AquaFix Services","Rapid Response Plumbing","Pro Plumb Solutions"] },
  carpenter:            { el:["Ξυλουργός Νίκος","Έπιπλα & Κατασκευές","WoodCraft GR","Κατασκευές Ξύλου","Ξυλουργικές Εργασίες"], de:["Tischler Zimmermann","Schreinerei Holz","Tischlerei Meister","Holzbau Fischer","Möbelschreinerei Weber"], en:["WoodCraft Carpentry","CarpentryPro Services","City Joinery","Timber & Craft","Master Carpenter Co."] },
  painter:              { el:["Ελαιοχρωματιστής Πέτρος","Βαφές & Αλοιφές","ColorPro GR","Χρωματισμοί Αθήνα","Ελαιοχρωματισμοί"], de:["Malerbetrieb Farbe","Malermeister Weiß","Malerservice Bunt","Maler & Lackierer","Malerfachbetrieb GmbH"], en:["PaintMaster Services","ColorPro Painters","City Decorators","Precision Painting Co.","ProPaint Solutions"] },
  locksmith:            { el:["Κλειδαράς Αντώνης","24ωρος Κλειδαράς","KeyMaster GR","Κλειδαράς Κεντρικός","Κλειδαράς Άμεση Εξυπηρέτηση"], de:["Schlüsseldienst Schnell","Schlüsselnotdienst","Schlüsseldienst 24h","Schlüsseldienst Meister","Schlosser am Ort"], en:["LockPro Services","KeyMaster Locksmiths","City Locksmith","24h Lock & Key","Rapid Response Locksmiths"] },
  cleaning:             { el:["Καθαρισμοί Αθήνα","CleanPro GR","Υπηρεσίες Καθαρισμού","Επαγγελματικοί Καθαρισμοί","SparkleClean GR"], de:["Reinigungsservice GmbH","CleanPro München","Gebäudereinigung Profi","Haushaltsreinigung Müller","Reinigung & Pflege"], en:["CleanPro Services","SparkleClean Co.","City Cleaning Services","PristineClean Ltd","HomeBright Cleaning"] },
  moving:               { el:["Μεταφορές Ποσειδών","Μετακομίσεις Αθήνα","MoveEasy GR","Speed Μεταφορές","Μεταφορές & Μετακομίσεις"], de:["Umzugsfirma Express","Umzugsservice Schnell","Umzug Profi GmbH","Umzugshelfer München","Transportservice Bauer"], en:["EasyMove Services","City Removals","ProMove Solutions","Swift Removals Co.","Trusted Movers"] },
  "computer-tech":      { el:["Τεχνικός Υπολογιστών","Επισκευές Laptop & PC","TechFix GR","IT Service Athens","PC Repair GR"], de:["PC-Service Müller","Computerreparatur Schmidt","IT-Service Profi","TechFix Berlin","Computer & Laptop Reparatur"], en:["TechFix IT Services","DigiCare Solutions","City Computer Repair","ProTech IT Support","PC Doctor"] },
  "appliance-tech":     { el:["Τεχνικός Οικιακών","Επισκευές Συσκευών","ApplianceFix GR","Τεχνικός Ηλεκτρικών","Επισκευές 24ωρες"], de:["Haushaltsgeräte Service","Elektrohaushaltsgeräte Reparatur","Gerätereparatur Profi","Weißware Service GmbH","Reparaturservice Bauer"], en:["ApplianceFix Services","FixPro Appliances","City Appliance Repair","Home Appliance Doctor","Rapid Appliance Services"] },
  lawyer:               { el:["Δικηγορικό Γραφείο Σπύρου","Νομική Εταιρεία Κόσμος","Legal Partners GR","Δικηγόρος Αθηνών","Νομικές Υπηρεσίες"], de:["Kanzlei Hoffmann","Rechtsanwalt Weber","Rechtsanwaltskanzlei Müller","Advokatur Schmidt","Anwaltskanzlei Bauer"], en:["Legal Partners LLP","City Solicitors","Law Office Associates","Chambers & Partners","Highstreet Legal"] },
  accountant:           { el:["Λογιστικό Γραφείο Δήμου","Κόσμος Λογιστική","Finance Solutions GR","Λογιστής Αθηνών","Φορολογικές Υπηρεσίες"], de:["Steuerberater Braun","Wirtschaftsprüfer Koch","Steuerbüro Müller","Steuerberatung Schmidt","Buchführung & Steuer"], en:["Taxwise Accountants","City Accountancy","Finance Solutions Group","ProAccounts Ltd","Chartered Accountants Co."] },
  "business-services":  { el:["Σύμβουλοι Επιχειρήσεων","Επιχειρηματικές Λύσεις","BizPro GR","Business Consulting GR","Στρατηγική Ανάπτυξη"], de:["Unternehmensberatung GmbH","Management Consulting","Business Solutions GmbH","Beratung & Strategie","Unternehmensentwicklung"], en:["BizPro Consulting","Business Solutions Group","City Business Services","Strategy & Growth Ltd","Enterprise Advisors"] },
  architect:            { el:["Αρχιτέκτονας Δημήτρης","Αρχιτεκτονικό Γραφείο","DesignBuild GR","Studio Αρχιτεκτονική","Αρχιτέκτονες & Μηχανικοί"], de:["Architekturbüro Bauer","Planungsbüro Müller","Architekten & Partner","Architektenstudio GmbH","Bauplaner Architekten"], en:["ArchiCraft Designs","DesignBuild Associates","City Architecture Studio","Creative Architects","Urban Design Partners"] },
  insurance:            { el:["Ασφαλιστικό Γραφείο Νίκου","Insurance Solutions GR","Ασφάλεια Αθήνα","ProInsure GR","Ασφαλιστική Εταιρεία"], de:["Versicherungsbüro Müller","Assekuranz Schmidt","Versicherungsagentur GmbH","Allianz Partner","Versicherungsbroker"], en:["InsurePlus Services","City Insurance Brokers","ProInsure Solutions","Shield Insurance","Nationwide Brokers"] },
  "car-mechanic":       { el:["Συνεργείο Νίκου","Αυτοκίνητα & Επισκευές","AutoFix GR","Μηχανολογικό Συνεργείο","Car Service Athens"], de:["KFZ-Werkstatt Müller","Autoservice Bauer","Kfz-Meisterbetrieb","Autowerkstatt Schnell","Auto & Technik GmbH"], en:["AutoFix Garage","City Car Services","ProAuto Workshop","FastFix Motors","Premier Auto Repairs"] },
  "driving-school":     { el:["Σχολή Οδηγών Γιώργου","Δίπλωμα & Οδήγηση","DriveEasy GR","Σχολή Οδηγών Κεντρική","AutoSchool Athens"], de:["Fahrschule Müller","Fahrschule am Markt","Fahrschule Top","Führerscheinschule GmbH","Fahrschule Profi"], en:["City Driving School","DriveEasy Academy","ProDrive School","FastPass Driving","Premier Driving Academy"] },
  taxi:                 { el:["Ταξί Κεντρικό","Athens Taxi Service","Taxi Express GR","Μεταφορές & Ταξί","Ταξί 24ωρο"], de:["Taxi Müller","Taxiservice Schnell","Taxi am Bahnhof","City Taxi GmbH","Taxifahrt Express"], en:["City Taxi Services","Metro Cab Co.","QuickRide Taxis","ProCab Services","Express Transfer"] },
  beauty:               { el:["Beauty Salon Athens","Κέντρο Ομορφιάς","Spa & Wellness GR","BeautyPro Athens","Ινστιτούτο Αισθητικής"], de:["Beautysalon Müller","Wellness & Beauty","Beauty Center GmbH","Kosmetikstudio Schön","Institut für Kosmetik"], en:["Beauty & Wellness Studio","City Beauty Bar","BeautyPro Salon","Glow Beauty Centre","Elite Beauty Spa"] },
  "hair-salon":         { el:["Κομμωτήριο Μαρία","Hair Studio Athens","Κομμωτής Γιάννης","Style & Hair GR","Κομμωτήριο Κεντρικό"], de:["Friseur Müller","Frisörsalon Schön","Hairstudio GmbH","Friseur am Markt","Frisurenmeister"], en:["Style & Scissors","City Hair Studio","The Hair Lounge","ProCut Salon","Glamour Hair Bar"] },
  aesthetician:         { el:["Αισθητική Δήμητρα","Ινστιτούτο Αισθητικής","Beauty & Skin GR","SkinCare Athens","Αισθητικός Κεντρικός"], de:["Kosmetikerin Müller","Kosmetikstudio Rein","Hautpflege Profi","Ästhetik & Beauty","SkinCare Studio GmbH"], en:["SkinCare Studio","The Aesthetics Clinic","Glow Skin Studio","ProSkin Aesthetics","Pure Beauty Clinic"] },
  gym:                  { el:["Γυμναστήριο Αθηνών","FitLife GR","PowerGym Athens","Κέντρο Ευεξίας","SportFit GR"], de:["Fitnessstudio Müller","FitLife München","PowerGym GmbH","Sport & Fitness","Sportcenter Aktiv"], en:["FitLife Gym","PowerZone Fitness","City Sports Centre","ProFit Gym","Iron & Flex Studio"] },
  restaurant:           { el:["Εστιατόριο Αθηνάς","Ταβέρνα Κεντρική","The Greek Kitchen","Athens Bistro","Grill & More GR"], de:["Restaurant Müller","Bistro am Markt","Gaststätte Bauer","Restaurant Schön","Wirtshaus am See"], en:["City Bistro","The Dining Room","Garden Restaurant","Urban Eats","Plate & Fork"] },
  "restaurant-tavernas":{ el:["Ταβέρνα Παπαδόπουλου","Ταβέρνα Ακρόπολη","To Spiti tis Kyras","Ταβέρνα Θαλασσινά","Ψητοπωλείο Κεντρικό"], de:["Griechisches Restaurant","Taverna Athena","Restaurant Griechenland","Ouzo Bar & Taverna","Mediterrane Küche"], en:["Taverna Hellas","The Olive Garden","Greek Bites","Aegean Taverna","Mediterranean Table"] },
  hotel:                { el:["Ξενοδοχείο Αθήνα","Grand Hotel GR","City Hotel Athens","Boutique Hotel GR","Hotel Κεντρικό"], de:["Hotel Müller","Stadthotel GmbH","Grand Hotel","Boutique Hotel am See","Hotel am Markt"], en:["City Grand Hotel","The Central Hotel","Boutique Stay","Urban Hotel","Premier Suites"] },
  villas:               { el:["Villa Αθηνά","Luxury Villas GR","Villa Κεντρική","Elite Villas GR","Rental Villas Athens"], de:["Villa Müller","Luxusvilla GmbH","Ferienhaus Bauer","Villa am See","Luxusresidenz"], en:["Luxury Villas Co.","Prestige Villa Rentals","Elite Escapes","Villa Collection","Dream Villas"] },
  "short-term-rentals": { el:["Airbnb Athens","Short Stay GR","Holiday Rentals GR","Ενοικιαζόμενα Δωμάτια","City Rentals Athens"], de:["Ferienwohnung Müller","Kurzzeit Wohnungen","Apartment am Markt","Ferienapartment GmbH","Stadtapartment"], en:["City Short Stays","Holiday Apartments","Urban Rentals","ProStay Rentals","Quick Let Apartments"] },
  "travel-agency":      { el:["Ταξιδιωτικό Γραφείο Κόσμος","Athens Travel Agency","Ταξίδια & Τουρισμός","TravelPro GR","Holiday Travel GR"], de:["Reisebüro Müller","Reiseagentur GmbH","Reisebüro am Markt","TravelPro Deutschland","Urlaubsreisen GmbH"], en:["World Travel Agency","City Travel Co.","Holiday Planners","TravelPro Solutions","Globe Trotter Agency"] },
  "tour-operator":      { el:["Tour Operator GR","Athens Tours","Ταξίδια Ελλάδα","Εκδρομές & Περιηγήσεις","ExploreGR Tours"], de:["Touroperator GmbH","Rundreisen Müller","Reiseleiter Pro","Adventure Tours","Kulturreisen GmbH"], en:["Explore Tours","City Tour Operators","Heritage Travel","Adventure Seekers Co.","ProTour Experiences"] },
  "construction-engineering":{ el:["Κατασκευαστική Εταιρεία","BuildPro GR","Τεχνική Εταιρεία","ConstructGR","Αρχιτέκτονες & Μηχανικοί"], de:["Baufirma Müller GmbH","Bauunternehmen Schmidt","Konstruktion & Bau","Tiefbau GmbH","Bau & Technik"], en:["BuildPro Construction","City Builders Ltd","Construct & Co.","Premier Builders","Urban Construction Group"] },
  "real-estate":        { el:["Κτηματομεσίτης Νίκου","Ακίνητα Αθήνα","PropertyPro GR","Real Estate Athens","Μεσιτικό Γραφείο"], de:["Immobilienmakler Müller","Immobilien GmbH","Wohnungsvermittlung Schmidt","ImmoPro GmbH","Haus & Grundstück"], en:["PropertyPro Realty","City Estate Agents","Premier Properties","Urban Realty","ProHome Estates"] },
  retail:               { el:["Κατάστημα Κεντρικό","ShopPro GR","Εμπορικό Κατάστημα","Retail Athens","Καταστήματα Αθήνα"], de:["Einzelhandel GmbH","Fachgeschäft Müller","Laden am Markt","Geschäft Bauer","Einzelhandelsgeschäft"], en:["City Retail Store","ShopPro Ltd","The Corner Shop","ProMart Retail","Urban Shop"] },
  florist:              { el:["Ανθοπωλείο Μαρία","Λουλούδια Κεντρικά","FlowerPro GR","Ανθοπωλείο Αθήνα","Bloom & Co GR"], de:["Blumenladen Müller","Floristik GmbH","Blumen am Markt","Floristenmeister","Blüten & Träume"], en:["City Florist","BloomCo Flowers","The Flower Garden","ProFloral Studio","Petal & Stem"] },
  education:            { el:["Φροντιστήριο Αθήνα","EduPro GR","Σχολείο & Παιδεία","Learning Center GR","Παιδαγωγικό Κέντρο"], de:["Bildungsinstitut GmbH","Lernzentrum Müller","Schule & Bildung","EduPro Deutschland","Nachhilfeinstitut"], en:["City Learning Centre","EduPro Academy","ProLearn Institute","The Study Hub","Learning Solutions Ltd"] },
  "language-school":    { el:["Σχολή Ξένων Γλωσσών","Language School GR","Γλωσσικό Κέντρο","English School Athens","ProLanguage GR"], de:["Sprachschule Müller","Sprachzentrum GmbH","Institut für Sprachen","Englisch lernen","Fremdsprachenakademie"], en:["City Language School","ProLingua Academy","The Language Hub","Multilingual Centre","Global Language School"] },
  photographer:         { el:["Φωτογράφος Νίκος","Photo Studio Athens","Photography GR","Φωτογραφικό Στούντιο","ProPhoto GR"], de:["Fotostudio Müller","Fotograf am Markt","Profifotograf GmbH","Foto & Video Studio","Lichtbild Profi"], en:["CityPhoto Studio","ProShot Photography","The Photography Studio","Capture Moments Co.","Elite Photographers"] },
  "event-planner":      { el:["Οργάνωση Εκδηλώσεων","EventPro GR","Γάμοι & Εκδηλώσεις","Athens Events","Wedding & Events GR"], de:["Eventplanung GmbH","Veranstaltungsorganisation","Events & Hochzeiten","Festorganisator","Event & Catering GmbH"], en:["EventPro Planning","City Events Co.","Premier Occasions","The Event Studio","Moments & Memories"] },
};

function mockLang(countryKey) {
  if (!countryKey) return "en";
  if (countryKey.includes("Greece") || countryKey.includes("Cyprus")) return "el";
  if (countryKey.includes("Germany") || countryKey.includes("Austria") || countryKey.includes("Switzerland")) return "de";
  return "en";
}

function generateMockBusinesses(countryKey, city, slug) {
  const lang     = mockLang(countryKey);
  const country  = countryKey.replace(/^[^\s]+\s/, ""); // strip flag emoji
  const nameBank = MOCK_NAMES[slug] || MOCK_NAMES["doctor"];
  const names    = nameBank[lang] || nameBank["en"];

  const domains  = [".com", ".eu", ".org", ".net", ".co.uk", ".gr", ".de", ".at"];
  const phones   = lang === "el"
    ? ["+30 210 ", "+30 231 0", "+30 261 0", "+30 281 0", "+30 2310 "]
    : lang === "de"
      ? ["+49 30 ", "+49 89 ", "+49 40 ", "+49 221 ", "+49 69 "]
      : ["+44 20 ", "+44 121 ", "+44 161 ", "+44 131 ", "+44 151 "];

  return names.map((name, i) => {
    const urlBase = name.toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 20);
    const domain = domains[i % domains.length];
    const phone  = phones[i % phones.length] + (Math.floor(Math.random() * 9000000) + 1000000);
    return {
      name,
      url:     `${urlBase}${domain}`,
      phone,
      city,
      country,
      slug,
    };
  });
}

/* ── DOM refs ────────────────────────────────────────── */
const board         = document.getElementById("ct-board");
const resultsSection = document.getElementById("ct-results-section");
const resultsGrid   = document.getElementById("ct-results-grid");
const resultsTitle  = document.getElementById("ct-results-title");

const searchBtn     = document.getElementById("ct-search-btn");
const searchErr     = document.getElementById("ct-search-err");

const runBtn        = document.getElementById("ct-run-btn");
const runErr        = document.getElementById("ct-run-err");

const reportOverlay = document.getElementById("ct-report-overlay");
const reportModal   = document.getElementById("ct-report-modal");
const reportClose   = document.getElementById("ct-report-close");
const reportDone    = document.getElementById("ct-report-done");
const reportPrint   = document.getElementById("ct-report-print");
const reportBody    = document.getElementById("ct-report-body");
const reportTitle   = document.getElementById("ct-report-title");

/* ── Populate country/city dropdowns ────────────────── */
let activeSite = null;

(function initDropdowns() {
  const countryEl = document.getElementById("s-country");
  const cityEl    = document.getElementById("s-city");

  Object.keys(COUNTRIES).forEach(c => {
    const opt = document.createElement("option");
    opt.value = c; opt.textContent = c;
    countryEl.appendChild(opt);
  });

  countryEl.addEventListener("change", () => {
    const cities = COUNTRIES[countryEl.value] || [];
    cityEl.innerHTML = `<option value="">— Select city —</option>`;
    cities.forEach(city => {
      const opt = document.createElement("option");
      opt.value = city; opt.textContent = city;
      cityEl.appendChild(opt);
    });
    cityEl.disabled = !countryEl.value;
    checkSearchReady();
  });

  cityEl.addEventListener("change", checkSearchReady);
  loadProfileSites();
})();

const NICHE_TO_SLUG = {
  "Medical Services":         "doctor",
  "Dental":                   "dentist",
  "Wellness & Therapy":       "physiotherapist",
  "Cleaning":                 "cleaning",
  "Construction & Renovation":"construction-engineering",
  "Plumbing & Electrical":    "plumber",
  "Legal":                    "lawyer",
  "Accounting & Finance":     "accountant",
  "Business Consulting":      "business-services",
  "Retail — General":         "retail",
  "Retail — Furniture":       "retail",
  "Retail — Fashion":         "retail",
  "eCommerce":                "retail",
  "Restaurant & Dining":      "restaurant",
  "Hotel & Accommodation":    "hotel",
  "Travel & Tourism":         "travel-agency",
  "SaaS / Software":          "computer-tech",
  "IT Services":              "computer-tech",
  "Digital Marketing":        "business-services",
  "Education & Training":     "education",
  "Sports Coaching":          "gym",
  "Language School":          "language-school",
  "Beauty & Aesthetics":      "beauty",
  "Fitness & Gym":            "gym",
  "Real Estate":              "real-estate",
  "Transport & Logistics":    "taxi",
  "Other":                    "business-services",
};

function nicheToSlug(niche) {
  return NICHE_TO_SLUG[niche] || "business-services";
}

async function loadProfileSites() {
  const nicheInput = document.getElementById("s-niche-input");
  const fallbackEl = document.getElementById("s-niche-fallback");
  const pickerEl   = document.getElementById("s-site-picker");
  const selectEl   = document.getElementById("s-site-select");

  // Always show the input
  if (fallbackEl) fallbackEl.style.display = "";
  if (pickerEl)   pickerEl.style.display   = "none";

  let prefill = "";

  // 1. Try server sites (primary), fall back to localStorage migration
  let sites = [];
  try {
    const sr = await fetch("/api/sites");
    if (sr.ok) { const sd = await sr.json(); sites = Array.isArray(sd.sites) ? sd.sites : []; }
  } catch {}
  if (!sites.length) {
    try { sites = JSON.parse(localStorage.getItem("eureach_sites") || "[]"); } catch {}
  }
  if (sites.length) {
    prefill = sites[0].niche || "";
    if (sites.length > 1 && selectEl) {
      selectEl.innerHTML = sites.map(s => `<option value="${s.id}">${esc(s.name || s.domain)}</option>`).join("");
      if (pickerEl) pickerEl.style.display = "";
      selectEl.onchange = () => {
        const s = sites.find(x => String(x.id) === selectEl.value);
        if (s && nicheInput) { nicheInput.value = s.niche || ""; nicheInput.dispatchEvent(new Event("input")); }
      };
    }
  }

  // 2. Fall back to server bizProfile if no localStorage niche
  if (!prefill) {
    try {
      const r = await fetch("/api/auth/me");
      if (r.ok) {
        const { user } = await r.json();
        const biz = user && user.bizProfile;
        if (biz && biz.industry) prefill = biz.industry;
      }
    } catch {}
  }

  // Set input value and activeSite
  if (nicheInput) {
    nicheInput.value = prefill;
    nicheInput.addEventListener("input", () => {
      const v = nicheInput.value.trim();
      activeSite = { name: v, industry: v, slug: nicheToSlug(v) };
      checkSearchReady();
    });
  }
  const v = prefill.trim();
  activeSite = v ? { name: v, industry: v, slug: nicheToSlug(v) } : null;
  checkSearchReady();
}

function showSiteInfo(site, infoEl) {
  if (!infoEl) return;
  const niche = site.niche ? " &middot; <span style='color:var(--muted)'>" + esc(site.niche) + "</span>" : "";
  infoEl.innerHTML = "<span style='color:var(--text)'>🏢 " + esc(site.name || site.domain) + "</span>"
    + niche
    + " <a href='settings.html' style='color:var(--blue2);font-size:0.78rem;margin-left:6px'>Edit</a>";
}

function checkSearchReady() {
  const country = document.getElementById("s-country").value;
  const city    = document.getElementById("s-city").value;
  const nicheInput = document.getElementById("s-niche-input");
  const nicheVal   = (nicheInput && nicheInput.value.trim()) || (activeSite && (activeSite.industry || activeSite.name)) || "";
  if (nicheVal && !activeSite) activeSite = { name: nicheVal, industry: nicheVal, slug: nicheToSlug(nicheVal) };
  searchBtn.disabled = !(country && city);
}

/* ── Manual audit modal ──────────────────────────────── */
function openManualModal() {
  const overlay = document.getElementById("ct-manual-overlay");
  const modal   = document.getElementById("ct-manual-modal");
  overlay.style.display = "";
  modal.style.display   = "";
  setTimeout(() => modal.classList.add("open"), 10);
  setTimeout(() => document.getElementById("m-name").focus(), 50);
}
function closeManualModal() {
  const modal = document.getElementById("ct-manual-modal");
  modal.classList.remove("open");
  setTimeout(() => {
    document.getElementById("ct-manual-overlay").style.display = "none";
    modal.style.display = "none";
  }, 200);
  document.getElementById("ct-run-err").textContent = "";
}
document.getElementById("ct-add-manual-btn").addEventListener("click", openManualModal);
document.getElementById("ct-manual-close").addEventListener("click", closeManualModal);
document.getElementById("ct-manual-overlay").addEventListener("click", closeManualModal);

/* ── Load tracked competitors ────────────────────────── */
async function load() {
  try {
    const res = await fetch("/api/competitor/track");
    if (res.status === 401) { showAuthNotice(); return; }
    if (!res.ok) return;
    const data = await res.json();
    competitors = data.competitors || [];
    renderBoard();
    loadSavedSearches();
  } catch {
    renderBoard();
  }
}

/* ── Set My Business ──────────────────────────────── */
async function setMyBusiness(id) {
  try {
    const res  = await fetch("/api/competitor/track/" + id + "/set-my-business", { method: "PATCH" });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Failed."); return; }
    competitors = competitors.map(c => Object.assign({}, c, { isMyBusiness: c.id === id }));
    renderBoard();
    updateCompareBtn();
  } catch { alert("Network error."); }
}

function updateCompareBtn() {
  const btn = document.getElementById("ct-compare-btn");
  if (btn) btn.style.display = competitors.length >= 1 ? "" : "none";
}

/* ── Comparison modal ─────────────────────────── */
function openCompareModal() {
  const overlay = document.getElementById("ct-compare-overlay");
  const modal   = document.getElementById("ct-compare-modal");
  const body    = document.getElementById("ct-compare-body");
  if (!overlay || !modal || !body) return;
  body.innerHTML = buildCompareTable();
  overlay.classList.add("open");
  modal.classList.add("open");
}

function closeCompareModal() {
  const overlay = document.getElementById("ct-compare-overlay");
  const modal   = document.getElementById("ct-compare-modal");
  if (overlay) overlay.classList.remove("open");
  if (modal)   modal.classList.remove("open");
}

function buildCompareTable() {
  const myBiz  = competitors.find(c => c.isMyBusiness);
  const others = competitors.filter(c => !c.isMyBusiness);

  if (!myBiz) {
    return '<div style="padding:32px;text-align:center;color:var(--muted)">' +
      '<div style="font-size:2rem;margin-bottom:12px">' + String.fromCodePoint(0x1F3E2) + '</div>' +
      '<div style="font-size:1rem;font-weight:700;color:var(--white);margin-bottom:8px">No business marked as yours yet</div>' +
      '<div style="font-size:0.85rem;max-width:380px;margin:0 auto">Click <strong style="color:var(--text)">Set Mine</strong> on one of your tracked cards to mark it as your business. It becomes the baseline column in the comparison.</div>' +
    '</div>';
  }

  if (!others.length) {
    return '<div style="padding:32px;text-align:center;color:var(--muted)">Track at least one competitor to compare against your business.</div>';
  }

  const METRICS = [
    { key: "_score",             label: "Overall Score",     useScore: true },
    { key: "ai_visibility",      label: "AI Visibility"                    },
    { key: "content_quality",    label: "Content Quality"                  },
    { key: "local_seo",          label: "Local SEO"                        },
    { key: "schema_markup",      label: "Schema Markup"                    },
    { key: "citation_readiness", label: "Citation Readiness"               },
  ];

  function getVal(comp, metric) {
    const snap = latestSnap(comp);
    if (!snap) return null;
    if (metric.useScore) return snap.score;
    return snap.breakdown ? snap.breakdown[metric.key] : null;
  }

  const allCols = [myBiz, ...others];

  const headerCells = allCols.map(c =>
    `<th class="ct-cmp-th${c.isMyBusiness ? " ct-cmp-mine-th" : ""}">` +
      (c.isMyBusiness ? String.fromCodePoint(0x1F3E2) + " " : "") + esc(c.competitorName) +
      (c.competitorUrl ? `<div class="ct-cmp-url">${esc(c.competitorUrl)}</div>` : "") +
    "</th>"
  ).join("");

  const rows = METRICS.map(metric => {
    const myVal = getVal(myBiz, metric);
    const cells = allCols.map(c => {
      const v = getVal(c, metric);
      const isMine = c.isMyBusiness;
      if (v === null) return `<td class="ct-cmp-td${isMine ? " ct-cmp-mine" : ""}"><span class="ct-cmp-na">&mdash;</span></td>`;
      const cmpCls = isMine ? "ct-cmp-mine" : (myVal === null ? "" : v > myVal ? "ct-cmp-behind" : v < myVal ? "ct-cmp-ahead" : "ct-cmp-equal");
      const scoreCls = v >= 70 ? "score-green" : v >= 40 ? "score-orange" : "score-red";
      return `<td class="ct-cmp-td ${cmpCls}"><span class="ct-cmp-score ${scoreCls}">${v}</span></td>`;
    }).join("");
    return `<tr><td class="ct-cmp-label">${metric.label}</td>${cells}</tr>`;
  }).join("");

  const legend = '<div class="ct-cmp-legend">' +
    '<span class="ct-cmp-leg-item"><span class="ct-cmp-leg-dot ahead"></span>You are ahead</span>' +
    '<span class="ct-cmp-leg-item"><span class="ct-cmp-leg-dot behind"></span>Competitor is ahead</span>' +
    '<span class="ct-cmp-leg-item"><span class="ct-cmp-leg-dot equal"></span>Equal</span>' +
  '</div>';

  return legend +
    '<div class="ct-cmp-wrap"><table class="ct-cmp-table">' +
      '<thead><tr><th class="ct-cmp-row-label">Metric</th>' + headerCells + '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table></div>';
}

/* ── Render tracked competitors board ───────────────── */
function renderBoard() {
  const empty = document.getElementById("ct-empty");

  document.getElementById("stat-total").textContent  = competitors.length;
  updateCompareBtn();
  const alerts = competitors.filter(c => c.alert).length;
  document.getElementById("stat-alerts").textContent  = alerts;
  if (competitors.length) {
    const scores = competitors.map(c => latestScore(c)).filter(s => s !== null);
    const avg    = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : "—";
    document.getElementById("stat-avg").textContent = avg;
  } else {
    document.getElementById("stat-avg").textContent = "—";
  }

  if (!competitors.length) {
    board.innerHTML = `<div class="ct-empty" id="ct-empty">
      <div class="ct-empty-icon">📡</div>
      <div class="ct-empty-title">No competitors tracked yet</div>
      <div class="ct-empty-sub">Search for businesses by country and category, then click "Audit" on any result to start tracking their AI visibility score.</div>
    </div>`;
    return;
  }

  const emptyEl = document.getElementById("ct-empty");
  if (emptyEl) emptyEl.remove();

  Array.from(board.children).forEach(el => { if (!el.classList.contains("ct-empty")) el.remove(); });

  competitors.forEach(comp => {
    if (!board.querySelector(`.ct-card[data-id="${comp.id}"]`)) {
      board.appendChild(buildCard(comp));
    }
  });
}

function latestScore(comp) {
  if (!comp.snapshots || !comp.snapshots.length) return null;
  return comp.snapshots[comp.snapshots.length - 1].score;
}

function latestSnap(comp) {
  if (!comp.snapshots || !comp.snapshots.length) return null;
  return comp.snapshots[comp.snapshots.length - 1];
}

function scoreColor(n) {
  if (n >= 70) return "score-green";
  if (n >= 40) return "score-orange";
  return "score-red";
}

const BREAKDOWN_LABELS = {
  ai_visibility:     "AI Visibility",
  content_quality:   "Content Quality",
  local_seo:         "Local SEO",
  schema_markup:     "Schema Markup",
  citation_readiness:"Citation Readiness",
};

/* ── Search for competitors ──────────────────────────── */
searchBtn.addEventListener("click", async () => {
  const countryKey = document.getElementById("s-country").value;
  const city       = document.getElementById("s-city").value;
  searchErr.textContent = "";

  if (!countryKey || !city) {
    searchErr.textContent = "Please select a country and city.";
    return;
  }

  const nicheInputEl = document.getElementById("s-niche-input");
  const typedNiche   = (nicheInputEl && nicheInputEl.value.trim()) || "";
  if (!activeSite && typedNiche) activeSite = { name: typedNiche, industry: typedNiche, slug: nicheToSlug(typedNiche) };
  const niche = (activeSite && (activeSite.industry || activeSite.name)) || typedNiche || "business";
  const label = niche;

  searchBtn.disabled = true;
  searchBtn.textContent = "🔍 Searching…";
  resultsSection.style.display = "";
  resultsTitle.textContent = `Searching for ${label} in ${city}…`;
  resultsGrid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--muted)"><div style="font-size:1.5rem;margin-bottom:8px">🔍</div>Finding real competitors on Google Maps…</div>`;
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const res  = await fetch("/api/competitor/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ niche, city, country: countryKey }),
    });
    const data = await res.json();

    if (!res.ok) {
      if (data.error === "no_places_key") {
        resultsGrid.innerHTML = `<div style="grid-column:1/-1;padding:24px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:10px;color:#f87171">⚠️ Google Places API key not set on the server. Add <code>GOOGLE_PLACES_API_KEY=your_key</code> to the .env file and restart.</div>`;
      } else {
        resultsGrid.innerHTML = `<div style="grid-column:1/-1;padding:16px;color:#f87171">Error: ${esc(data.error || data.message || "Search failed.")}</div>`;
      }
      resultsTitle.textContent = "Search failed";
      return;
    }

    const businesses = data.results || [];
    resultsTitle.textContent = businesses.length
      ? `${businesses.length} result${businesses.length !== 1 ? "s" : ""} — ${label} in ${city}`
      : `No results found for ${label} in ${city}`;
    resultsGrid.innerHTML = "";
    if (!businesses.length) {
      resultsGrid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--muted)">No businesses found. Try a different city or check your search category.</div>`;
      return;
    }
    businesses.forEach(b => resultsGrid.appendChild(buildResultCard(b)));
    currentSearchResults = businesses;
    currentSearchLabel   = label + " in " + city + ", " + countryKey.replace(/^\S+\s/, "");
    const saveBtn = document.getElementById("ct-save-list-btn");
    if (saveBtn) { saveBtn.style.display = ""; saveBtn.textContent = "💾 Save List"; saveBtn.disabled = false; }
  } catch (err) {
    resultsGrid.innerHTML = `<div style="grid-column:1/-1;padding:16px;color:#f87171">Search error: ${esc(err.message)}</div>`;
    resultsTitle.textContent = "Search failed";
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = "🔍 Find Competitors";
  }
});

function buildResultCard(b) {
  const card = document.createElement("div");
  card.className = "ct-result-card";

  const alreadyTracked = competitors.some(
    c => c.competitorName.toLowerCase() === b.name.toLowerCase()
  );

  const displayUrl = b.website || b.url || "";
  const ratingHtml = b.rating ? `<span>⭐ ${b.rating}${b.reviews ? ` (${b.reviews})` : ""}</span>` : "";
  card.innerHTML = `
  <div class="ct-result-info">
    <div class="ct-result-name">${esc(b.name)}</div>
    <div class="ct-result-meta">
      ${b.address ? `<span>📍 ${esc(b.address)}</span>` : (b.city ? `<span>📍 ${esc(b.city)}</span>` : "")}
      ${displayUrl ? `<span>🌐 <a href="https://${esc(displayUrl)}" target="_blank" rel="noopener">${esc(displayUrl)}</a></span>` : ""}
      ${b.phone ? `<span>📞 <a href="tel:${b.phone.replace(/\s/g,'')}">${esc(b.phone)}</a></span>` : ""}
      ${ratingHtml}
    </div>
  </div>
  <button class="ct-audit-btn${alreadyTracked ? " ct-audit-btn-done" : ""}" ${alreadyTracked ? "disabled" : ""}>
    ${alreadyTracked ? "✓ Tracked" : "▶ Audit This"}
  </button>`;

  if (!alreadyTracked) {
    card.querySelector(".ct-audit-btn").addEventListener("click", function() {
      auditBusiness(this, b);
    });
  }

  return card;
}

/* ── Audit a business from search results ────────────── */
async function auditBusiness(btn, b) {
  btn.disabled    = true;
  btn.textContent = "Auditing…";

  try {
    const res = await fetch("/api/competitor/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        competitorName: b.name,
        competitorUrl:  b.website || b.url || "",
        industry:       activeSite?.industry || "",
        country:        document.getElementById("s-country").value.replace(/^\S+\s/, ""),
        city:           document.getElementById("s-city").value,
        language:       mockLang(document.getElementById("s-country").value),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      btn.disabled    = false;
      btn.textContent = "▶ Audit This";
      alert(data.error || "Audit failed. Please try again.");
      return;
    }
    competitors.push(data.competitor);
    renderBoard();
    btn.textContent = "✓ Tracked";
    btn.classList.add("ct-audit-btn-done");

    document.getElementById("ct-board-section").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    btn.disabled    = false;
    btn.textContent = "▶ Audit This";
    alert("Network error. Please try again.");
  }
}

/* ── Manual audit run ────────────────────────────────── */
runBtn.addEventListener("click", async () => {
  const name     = document.getElementById("m-name").value.trim();
  const url      = document.getElementById("m-url").value.trim();
  const industry = document.getElementById("m-industry").value;
  const lang     = document.getElementById("m-lang").value;
  runErr.textContent = "";

  if (!name) {
    runErr.textContent = "Business name is required.";
    document.getElementById("m-name").focus();
    return;
  }

  runBtn.disabled    = true;
  runBtn.textContent = url ? "⏳ Crawling website…" : "⏳ Running audit…";
  if (url) setTimeout(() => { if (runBtn.disabled) runBtn.textContent = "🤖 Analyzing with AI…"; }, 6000);

  try {
    const res = await fetch("/api/competitor/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ competitorName: name, competitorUrl: url, industry, language: lang }),
    });
    const data = await res.json();
    if (!res.ok) { runErr.textContent = data.error || "Failed to run audit."; return; }
    competitors.push(data.competitor);
    renderBoard();
    document.getElementById("m-name").value = "";
    document.getElementById("m-url").value  = "";
    closeManualModal();
    document.getElementById("ct-board-section").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    runErr.textContent = "Network error. Please try again.";
  } finally {
    runBtn.disabled    = false;
    runBtn.textContent = "▶ Run Audit & Track";
  }
});

/* ── Build tracked competitor card ───────────────────── */
function buildCard(comp) {
  const card = document.createElement("div");
  card.className = "ct-card" + (comp.alert ? " ct-card-alert" : "");
  card.dataset.id = comp.id;

  const snap    = latestSnap(comp);
  const score   = snap ? snap.score : null;
  const clsNum  = score !== null ? scoreColor(score) : "score-orange";
  const checked = snap ? fmtDate(snap.date) : "Never";

  card.innerHTML = `
  <div class="ct-card-header">
    <div>
      <div class="ct-card-name">${esc(comp.competitorName)}</div>
      ${comp.competitorUrl ? `<div class="ct-card-url"><a href="https://${esc(comp.competitorUrl)}" target="_blank" rel="noopener">${esc(comp.competitorUrl)}</a></div>` : ""}
    </div>
    <div class="ct-card-badges">
      ${comp.isMyBusiness ? '<span class="ct-my-biz-badge">My Business</span>' : ""}
      ${comp.alert ? `<span class="ct-alert-badge">⚠ Score Drop</span>` : ""}
      ${comp.industry ? `<span class="ct-industry-tag">${esc(comp.industry.replace("_", " "))}</span>` : ""}
    </div>
  </div>

  <div class="ct-score-section">
    <div class="ct-score-big">
      <span class="ct-score-num ${clsNum}">${score !== null ? score : "—"}</span>
      <span class="ct-score-denom">/100</span>
    </div>
    <div class="ct-score-meta">
      <div class="ct-last-checked">Last checked: ${esc(checked)}</div>
      ${snap && snap.lastUpdated ? `<div class="ct-site-updated">Site updated: <strong>${fmtDate(snap.lastUpdated)}</strong></div>` : ""}
      ${snap && snap.recentUpdates && snap.recentUpdates.length > 1 ? `<div class="ct-site-updates-list">Recent updates: ${snap.recentUpdates.slice(0,3).map(d => fmtDate(d)).join(" · ")}</div>` : ""}
    </div>
  </div>

  ${snap && snap.breakdown ? buildBreakdown(snap.breakdown) : ""}
  ${buildChart(comp)}

  <div class="ct-card-footer">
    <button class="ct-btn ct-check-btn" data-id="${esc(comp.id)}">↺ Run Check</button>
    <button class="ct-btn ct-report-btn" data-id="${esc(comp.id)}">📄 Report</button>
    <button class="ct-btn ct-share-btn" data-id="${esc(comp.id)}" data-token="${esc(comp.shareToken || "")}">🔗 Share</button>
    <button class="ct-btn ct-set-mine-btn${comp.isMyBusiness ? ' ct-set-mine-active' : ''}" data-id="${esc(comp.id)}">${comp.isMyBusiness ? 'Mine' : 'Set Mine'}</button>
      <button class="ct-btn ct-btn-danger ct-delete-btn" data-id="${esc(comp.id)}">✕</button>
  </div>

  <div class="ct-timeline" id="timeline-${esc(comp.id)}">
    <div class="ct-timeline-header" data-id="${esc(comp.id)}">History <span>▾</span></div>
    ${buildTimeline(comp)}
  </div>`;

  card.querySelector(".ct-check-btn").addEventListener("click", () => runCheck(comp.id));
  card.querySelector(".ct-report-btn").addEventListener("click", () => openReport(comp.id));
  card.querySelector(".ct-share-btn").addEventListener("click", e => copyShare(e.currentTarget));
  card.querySelector(".ct-set-mine-btn").addEventListener("click", () => setMyBusiness(comp.id));
  card.querySelector(".ct-delete-btn").addEventListener("click", () => deleteComp(comp.id, comp.competitorName));
  card.querySelector(".ct-timeline-header").addEventListener("click", () => {
    const tl = document.getElementById(`timeline-${comp.id}`);
    tl.classList.toggle("open");
    const arrow = card.querySelector(".ct-timeline-header span");
    if (arrow) arrow.textContent = tl.classList.contains("open") ? "▴" : "▾";
  });

  return card;
}

function buildBreakdown(breakdown) {
  const keys = Object.keys(BREAKDOWN_LABELS);
  const rows = keys.filter(k => breakdown[k] !== undefined).map(k => {
    const val = breakdown[k];
    const cls = scoreColor(val);
    return `
    <div class="ct-breakdown-row">
      <span class="ct-breakdown-label">${BREAKDOWN_LABELS[k]}</span>
      <div class="ct-bar-track"><div class="ct-bar-fill ${cls}" style="width:${val}%"></div></div>
      <span class="ct-breakdown-score ${cls}">${val}</span>
    </div>`;
  }).join("");
  return `<div class="ct-breakdown">${rows}</div>`;
}

function buildChart(comp) {
  if (!comp.snapshots || comp.snapshots.length < 2) {
    return `<div class="ct-chart-wrap"><div class="ct-chart-label">Score Trend</div><div class="ct-chart-single">Only 1 data point — run another check to see the trend</div></div>`;
  }
  const W = 320, H = 56, P = 8;
  const snaps  = comp.snapshots;
  const scores = snaps.map(s => s.score);
  const minS   = Math.max(0,   Math.min(...scores) - 10);
  const maxS   = Math.min(100, Math.max(...scores) + 10);
  const range  = maxS - minS || 1;

  const pts = snaps.map((s, i) => {
    const x = P + (i / (snaps.length - 1)) * (W - P * 2);
    const y = H - P - ((s.score - minS) / range) * (H - P * 2);
    return { x, y, score: s.score };
  });

  const polyline = pts.map(p => `${p.x},${p.y}`).join(" ");
  const areaPath = `M${pts[0].x},${H - P} ` + pts.map(p => `L${p.x},${p.y}`).join(" ") + ` L${pts[pts.length-1].x},${H - P} Z`;
  const lastScore = scores[scores.length - 1];
  const lineColor = lastScore >= 70 ? "#4ade80" : lastScore >= 40 ? "#fbbf24" : "#f87171";
  const dots = pts.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${lineColor}" />`).join("");

  return `
  <div class="ct-chart-wrap">
    <div class="ct-chart-label">Score Trend</div>
    <svg class="ct-chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
      <defs><linearGradient id="grad-${esc(comp.id)}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="${lineColor}" stop-opacity="0"/>
      </linearGradient></defs>
      <path d="${areaPath}" fill="url(#grad-${esc(comp.id)})" />
      <polyline points="${polyline}" fill="none" stroke="${lineColor}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
      ${dots}
    </svg>
  </div>`;
}

function buildTimeline(comp) {
  if (!comp.snapshots || !comp.snapshots.length) return `<div class="ct-timeline-row"><span class="ct-timeline-date">No data yet</span></div>`;
  const snaps = [...comp.snapshots].reverse();
  return snaps.map((s, i) => {
    const prev = snaps[i + 1];
    let delta = "", deltaCls = "ct-delta-flat";
    if (prev) {
      const diff = s.score - prev.score;
      if (diff > 0)       { delta = `+${diff}`;  deltaCls = "ct-delta-up"; }
      else if (diff < 0)  { delta = `${diff}`;   deltaCls = "ct-delta-down"; }
      else                { delta = "—"; }
    }
    return `
    <div class="ct-timeline-row">
      <span class="ct-timeline-date">${fmtDate(s.date)}</span>
      <span class="ct-timeline-score ${scoreColor(s.score)}">${s.score}</span>
      <span class="ct-timeline-delta ${deltaCls}">${delta}</span>
    </div>`;
  }).join("");
}

/* ── Run check on tracked competitor ─────────────────── */
async function runCheck(id) {
  const card = document.querySelector(`.ct-card[data-id="${id}"]`);
  const btn  = card ? card.querySelector(".ct-check-btn") : null;
  if (btn) { btn.disabled = true; btn.textContent = "Checking…"; }
  try {
    const res  = await fetch(`/api/competitor/track/${id}/check`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Check failed."); return; }
    const idx = competitors.findIndex(c => c.id === id);
    if (idx !== -1) competitors[idx] = data.competitor;
    renderBoard();
  } catch {
    alert("Network error. Please try again.");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "↺ Run Check"; }
  }
}

/* ── Delete ──────────────────────────────────────────── */
async function deleteComp(id, name) {
  if (!confirm(`Remove "${name}" from tracking?`)) return;
  try {
    const res = await fetch(`/api/competitor/track/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    competitors = competitors.filter(c => c.id !== id);
    renderBoard();
  } catch {}
}

/* ── Share ───────────────────────────────────────────── */
function copyShare(btn) {
  const token = btn.dataset.token;
  if (!token) { alert("No share token found."); return; }
  const url = `${location.origin}/audit/share/${token}`;
  navigator.clipboard.writeText(url).then(() => {
    const orig = btn.textContent;
    btn.textContent = "✓ Copied!";
    setTimeout(() => { btn.textContent = orig; }, 2000);
  }).catch(() => {
    prompt("Copy this share link:", url);
  });
}

/* ── Report modal ────────────────────────────────────── */
function openReport(id) {
  const comp = competitors.find(c => c.id === id);
  if (!comp) return;
  const snap = latestSnap(comp);
  if (!snap) return;

  reportTitle.textContent = `AI Visibility Report — ${comp.competitorName}`;
  const scoreNum  = snap.score;
  const scoreCls  = scoreColor(scoreNum);
  const bd        = snap.breakdown || {};

  const breakdownRows = Object.keys(BREAKDOWN_LABELS).filter(k => bd[k] !== undefined).map(k => {
    const val = bd[k];
    const cls = scoreColor(val);
    return `
    <div class="ct-report-breakdown-row">
      <span>${BREAKDOWN_LABELS[k]}</span>
      <div class="ct-report-bar-track"><div class="ct-report-bar-fill ${cls}" style="width:${val}%;height:100%;border-radius:3px"></div></div>
      <span class="ct-report-score-val ${cls}">${val}</span>
    </div>`;
  }).join("");

  const listItems = (arr) => (arr || []).map(s => `<li>${esc(s)}</li>`).join("");

  reportBody.innerHTML = `
  <div class="ct-report-content">
    <div class="ct-report-top">
      <div class="ct-report-score-big ${scoreCls}">${scoreNum}</div>
      <div class="ct-report-meta">
        <div class="ct-report-meta-name">${esc(comp.competitorName)}</div>
        ${comp.competitorUrl ? `<div class="ct-report-meta-url">${esc(comp.competitorUrl)}</div>` : ""}
        <div class="ct-report-meta-date">Report generated: ${fmtDate(snap.date)} · Industry: ${esc(comp.industry || "—")}</div>
      </div>
    </div>
    ${breakdownRows ? `<div class="ct-report-section"><div class="ct-report-section-title">Score Breakdown</div>${breakdownRows}</div>` : ""}
    ${(snap.strengths || []).length ? `<div class="ct-report-section"><div class="ct-report-section-title">Strengths</div><ul class="ct-report-list strengths">${listItems(snap.strengths)}</ul></div>` : ""}
    ${(snap.weaknesses || []).length ? `<div class="ct-report-section"><div class="ct-report-section-title">Weaknesses</div><ul class="ct-report-list weaknesses">${listItems(snap.weaknesses)}</ul></div>` : ""}
    ${(snap.recommendations || []).length ? `<div class="ct-report-section"><div class="ct-report-section-title">Recommendations</div><ul class="ct-report-list recs">${listItems(snap.recommendations)}</ul></div>` : ""}
    <div class="ct-report-section" style="font-size:0.72rem;color:var(--muted);padding-top:10px;border-top:1px solid var(--border)">
      Generated by <strong style="color:var(--text)">eureach.eu</strong> AI Visibility Tracker · ${new Date().getFullYear()}
    </div>
  </div>`;

  reportOverlay.classList.add("open");
  reportModal.classList.add("open");
}

function closeReport() {
  reportOverlay.classList.remove("open");
  reportModal.classList.remove("open");
}

reportClose.addEventListener("click", closeReport);
reportDone.addEventListener("click", closeReport);
reportOverlay.addEventListener("click", e => { if (e.target === reportOverlay) closeReport(); });
reportPrint.addEventListener("click", () => window.print());

/* ── Auth notice ─────────────────────────────────────── */
function showAuthNotice() {
  board.innerHTML = `<div class="ct-empty"><div class="ct-empty-icon">🔒</div><div class="ct-empty-title">Sign in to track competitors</div><div class="ct-empty-sub"><a href="signin.html" style="color:var(--blue2)">Sign in</a> to access the Competitor Tracker.</div></div>`;
  document.getElementById("ct-stats").style.display = "none";
}

/* ── Util ────────────────────────────────────────────── */
function esc(s) {
  const d = document.createElement("div");
  d.textContent = String(s || "");
  return d.innerHTML;
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/* ── Load business profile → pre-fill search ─────────── */
async function loadBusinessProfile() {
  try {
    const res = await fetch("/api/business/profile");
    if (!res.ok) return;
    const { profile } = await res.json();
    if (!profile) return;

    const countryEl = document.getElementById("s-country");
    const cityEl    = document.getElementById("s-city");
    const catEl     = document.getElementById("s-cat");

    if (profile.country && countryEl) {
      countryEl.value = profile.country;
      countryEl.dispatchEvent(new Event("change"));
    }

    if (profile.city && cityEl) {
      const cities = COUNTRIES[profile.country] || [];
      const match  = cities.find(c => c.toLowerCase() === profile.city.toLowerCase());
      if (match) {
        cityEl.value = match;
      } else {
        const opt = document.createElement("option");
        opt.value = profile.city; opt.textContent = profile.city;
        cityEl.appendChild(opt);
        cityEl.value = profile.city;
      }
      cityEl.disabled = false;
      catEl.disabled  = false;
    }

    if (profile.industry && catEl) {
      const cat = CATEGORIES.find(c => c.sub.some(s => s.slug === profile.industry));
      if (cat) {
        catEl.value = cat.slug;
        catEl.dispatchEvent(new Event("change"));
        setTimeout(() => {
          const subcatEl = document.getElementById("s-subcat");
          if (subcatEl) subcatEl.value = profile.industry;
          checkSearchReady();
        }, 50);
      }
    }
    checkSearchReady();

    if (profile.businessName) {
      const banner = document.createElement("div");
      banner.className = "ct-biz-banner";
      banner.innerHTML = `<span class="ct-biz-label">Your business:</span> <strong>${esc(profile.businessName)}</strong>${profile.city ? ` · ${esc(profile.city)}` : ""} · <a href="settings.html#business">Edit</a>`;
      document.getElementById("ct-panel").insertBefore(banner, document.getElementById("ct-panel").firstChild);
    }
  } catch {}
}

/* ── Nav auth state ──────────────────────────────────── */
async function loadNavState() {
  try {
    const res = await fetch('/api/auth/me');
    const signInBtn  = document.querySelector('a[href="signin.html"].btn-ghost');
    const profileBtn = document.getElementById('nav-profile-btn');
    if (!res.ok) { if (profileBtn) profileBtn.style.display = 'none'; return; }
    const { user } = await res.json();
    if (!user) { if (profileBtn) profileBtn.style.display = 'none'; return; }
    if (signInBtn)  signInBtn.style.display  = 'none';
    if (profileBtn) profileBtn.textContent   = (user.firstName?.[0] || user.email?.[0] || 'U').toUpperCase();
  } catch {}
}

/* ── Save search list ────────────────────────────────── */
document.getElementById("ct-save-list-btn").addEventListener("click", saveSearchList);

async function saveSearchList() {
  if (!currentSearchResults.length) return;
  const btn = document.getElementById("ct-save-list-btn");
  btn.disabled    = true;
  btn.textContent = "Saving…";
  try {
    const res = await fetch("/api/competitor/saved-searches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: currentSearchLabel, results: currentSearchResults }),
    });
    const data = await res.json();
    if (!res.ok) {
      btn.disabled    = false;
      btn.textContent = "💾 Save List";
      alert(data.error || "Save failed.");
      return;
    }
    btn.textContent = "✓ Saved!";
    setTimeout(() => { btn.textContent = "💾 Save List"; btn.disabled = false; }, 2500);
    loadSavedSearches();
  } catch {
    btn.disabled    = false;
    btn.textContent = "💾 Save List";
    alert("Network error. Please try again.");
  }
}

/* ── Saved lists view ────────────────────────────────── */
async function loadSavedSearches() {
  try {
    const res = await fetch("/api/competitor/saved-searches");
    if (!res.ok) return;
    const { savedSearches } = await res.json();
    renderSavedSearches(savedSearches || []);
  } catch {}
}

function renderSavedSearches(lists) {
  const section = document.getElementById("ct-saved-section");
  if (section) section.style.display = "none";
  renderSavedSidebar(lists);
}

function renderSavedSidebar(lists) {
  const wrap = document.getElementById("ct-sidebar-saved");
  const list = document.getElementById("ct-sidebar-saved-list");
  if (!wrap || !list) return;
  if (!lists.length) { wrap.style.display = "none"; return; }
  wrap.style.display = "";
  list.innerHTML = "";
  [...lists].reverse().forEach(s => {
    const item = document.createElement("div");
    item.className = "ct-sidebar-saved-item";
    item.dataset.id = s.id;
    const labelEsc = esc(s.label);
    const idEsc = esc(s.id);
    const dateStr = fmtDate(s.savedAt);
    const count = s.results.length;
    item.innerHTML =
      '<div class="ct-sidebar-saved-row">' +
        '<div class="ct-sidebar-saved-info">' +
          '<div class="ct-sidebar-saved-label">' + labelEsc + '</div>' +
          '<div class="ct-sidebar-saved-meta">' + dateStr + ' · ' + count + ' businesses</div>' +
        '</div>' +
        '<button class="ct-sidebar-saved-del" data-id="' + idEsc + '" title="Delete">✕</button>' +
      '</div>';
    item.addEventListener("click", function(e) {
      if (e.target.classList.contains("ct-sidebar-saved-del")) return;
      showSavedInCenter(s, item);
    });
    item.querySelector(".ct-sidebar-saved-del").addEventListener("click", function(e) {
      e.stopPropagation();
      deleteSavedSearch(s.id);
    });
    list.appendChild(item);
  });
}

function showSavedInCenter(s, activeEl) {
  document.querySelectorAll(".ct-sidebar-saved-item").forEach(function(el) { el.classList.remove("active"); });
  if (activeEl) activeEl.classList.add("active");
  currentSearchResults = s.results;
  currentSearchLabel   = s.label;
  resultsSection.style.display = "";
  resultsTitle.textContent     = s.label;
  resultsGrid.innerHTML        = "";
  s.results.forEach(function(b) { resultsGrid.appendChild(buildResultCard(b)); });
  const saveBtn = document.getElementById("ct-save-list-btn");
  if (saveBtn) { saveBtn.style.display = ""; saveBtn.textContent = "💾 Save as New List"; saveBtn.disabled = false; }
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteSavedSearch(id) {
  if (!confirm("Delete this saved list?")) return;
  try {
    const res = await fetch(`/api/competitor/saved-searches/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    loadSavedSearches();
  } catch {}
}

/* ── Init ────────────────────────────────────────────── */
document.getElementById("ct-compare-btn").addEventListener("click", openCompareModal);
document.getElementById("ct-compare-close").addEventListener("click", closeCompareModal);
document.getElementById("ct-compare-overlay").addEventListener("click", e => {
  if (e.target === document.getElementById("ct-compare-overlay")) closeCompareModal();
});
loadNavState();
renderBoard();
load();
loadBusinessProfile();
loadSavedSearches();
