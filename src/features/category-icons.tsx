import {
  Accessibility,
  Ambulance,
  Anchor,
  Apple,
  Armchair,
  Award,
  Axe,
  Baby,
  Backpack,
  Banana,
  Bandage,
  Banknote,
  Bath,
  Battery,
  BedDouble,
  Beef,
  Beer,
  Bell,
  Bike,
  Bird,
  Bone,
  Book,
  BookOpen,
  Bookmark,
  Box,
  Brain,
  Briefcase,
  Brush,
  Building2,
  Bus,
  CakeSlice,
  Calculator,
  Calendar,
  Camera,
  Candy,
  Car,
  Carrot,
  Cat,
  ChartPie,
  Cherry,
  Church,
  Cigarette,
  Clapperboard,
  Clock,
  Cloud,
  Code,
  Coffee,
  Coins,
  Compass,
  CookingPot,
  Cookie,
  CreditCard,
  Cross,
  Crown,
  Croissant,
  Dice5,
  Dog,
  DollarSign,
  DoorOpen,
  Drama,
  Drill,
  Droplet,
  Dumbbell,
  Egg,
  Factory,
  Film,
  Fish,
  Flag,
  Flame,
  Flower,
  Footprints,
  Fuel,
  Gamepad2,
  Gem,
  Gift,
  Glasses,
  Goal,
  GraduationCap,
  Grape,
  Hammer,
  HandCoins,
  Handshake,
  Headphones,
  Heart,
  HeartPulse,
  Hospital,
  Hotel,
  House,
  IceCreamCone,
  Key,
  Lamp,
  Landmark,
  Laptop,
  Leaf,
  Library,
  Lightbulb,
  Lock,
  Luggage,
  Mail,
  // Aliased: the Lucide export `Map` would shadow the global `Map` constructor.
  Map as MapIcon,
  MapPin,
  Medal,
  Microwave,
  Milk,
  Monitor,
  Mountain,
  Music,
  Nut,
  Package,
  PaintRoller,
  Paintbrush,
  Palette,
  PawPrint,
  Pencil,
  Percent,
  PersonStanding,
  Phone,
  PiggyBank,
  Pill,
  Pizza,
  Plane,
  Plug,
  Popcorn,
  Printer,
  Receipt,
  Recycle,
  Refrigerator,
  Rocket,
  Ruler,
  Salad,
  Sandwich,
  Scale,
  School,
  Scissors,
  Send,
  Server,
  Shirt,
  ShieldCheck,
  ShoppingBag,
  ShoppingBasket,
  ShoppingCart,
  Shovel,
  Smartphone,
  Snowflake,
  Sofa,
  Soup,
  Sparkles,
  Sprout,
  Star,
  Stethoscope,
  Store,
  Sun,
  Syringe,
  Tag,
  Tent,
  Thermometer,
  Ticket,
  TramFront,
  TrainFront,
  Trees,
  TrendingUp,
  Trophy,
  Truck,
  Tv,
  Umbrella,
  User,
  Users,
  Utensils,
  Volleyball,
  Wallet,
  Warehouse,
  WashingMachine,
  Watch,
  Wifi,
  Wind,
  Wine,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { createElement } from "react";
import { cn } from "@/lib/utils";

/**
 * The category-icon catalog (§10.1, M11): the searchable set a category can wear
 * instead of its plain colour dot. It is a curated, generous slice of Lucide —
 * every icon here is imported by name, so the bundle carries only these, not all
 * ~1,600 (importing the whole set to offer it defeats tree-shaking for a picker).
 *
 * The stored value on a `Category` is the entry's `name` (its PascalCase Lucide
 * export name — the stable API identity). An unknown name (an icon this build
 * doesn't carry, or one synced from a newer version) resolves to `undefined` and
 * the glyph falls back to the colour dot — never a blank.
 *
 * `keywords` exists so search finds an icon by what it IS, not only by its Lucide
 * name: "grocery" finds the cart, "gym" the dumbbell, "petrol" the fuel pump.
 */
export interface CategoryIcon {
  name: string;
  Icon: LucideIcon;
  keywords: string;
}

export const CATEGORY_ICONS: readonly CategoryIcon[] = [
  // Food & drink
  { name: "Utensils", Icon: Utensils, keywords: "food eat dining restaurant meal" },
  { name: "Coffee", Icon: Coffee, keywords: "cafe drink tea espresso latte" },
  { name: "Pizza", Icon: Pizza, keywords: "food takeout fast" },
  { name: "Sandwich", Icon: Sandwich, keywords: "food lunch deli" },
  { name: "Salad", Icon: Salad, keywords: "food healthy veg greens" },
  { name: "Soup", Icon: Soup, keywords: "food bowl broth" },
  { name: "Beef", Icon: Beef, keywords: "food meat steak butcher" },
  { name: "Fish", Icon: Fish, keywords: "food seafood" },
  { name: "Egg", Icon: Egg, keywords: "food breakfast" },
  { name: "Apple", Icon: Apple, keywords: "food fruit healthy" },
  { name: "Banana", Icon: Banana, keywords: "food fruit" },
  { name: "Grape", Icon: Grape, keywords: "food fruit" },
  { name: "Cherry", Icon: Cherry, keywords: "food fruit" },
  { name: "Carrot", Icon: Carrot, keywords: "food veg vegetable" },
  { name: "Croissant", Icon: Croissant, keywords: "food bakery pastry breakfast" },
  { name: "CakeSlice", Icon: CakeSlice, keywords: "food dessert birthday sweet" },
  { name: "Cookie", Icon: Cookie, keywords: "food dessert snack sweet" },
  { name: "Candy", Icon: Candy, keywords: "food sweets treat" },
  { name: "IceCreamCone", Icon: IceCreamCone, keywords: "food dessert sweet" },
  { name: "Nut", Icon: Nut, keywords: "food snack" },
  { name: "Milk", Icon: Milk, keywords: "food dairy grocery drink" },
  { name: "Beer", Icon: Beer, keywords: "drink alcohol pub bar" },
  { name: "Wine", Icon: Wine, keywords: "drink alcohol bar" },
  { name: "CookingPot", Icon: CookingPot, keywords: "food cooking kitchen home" },
  // Shopping
  {
    name: "ShoppingCart",
    Icon: ShoppingCart,
    keywords: "grocery groceries store buy shop",
  },
  { name: "ShoppingBasket", Icon: ShoppingBasket, keywords: "grocery store buy shop" },
  { name: "ShoppingBag", Icon: ShoppingBag, keywords: "shopping retail buy mall" },
  { name: "Store", Icon: Store, keywords: "shop retail market" },
  { name: "Tag", Icon: Tag, keywords: "price sale discount shopping" },
  { name: "Gift", Icon: Gift, keywords: "present birthday gifts" },
  { name: "Shirt", Icon: Shirt, keywords: "clothes clothing apparel fashion" },
  { name: "Watch", Icon: Watch, keywords: "accessory time fashion" },
  { name: "Glasses", Icon: Glasses, keywords: "eyewear optician fashion" },
  { name: "Gem", Icon: Gem, keywords: "jewelry luxury diamond" },
  { name: "Crown", Icon: Crown, keywords: "luxury premium" },
  { name: "Footprints", Icon: Footprints, keywords: "shoes walking steps" },
  { name: "Package", Icon: Package, keywords: "delivery parcel shipping order" },
  { name: "Box", Icon: Box, keywords: "delivery parcel storage" },
  // Home & utilities
  { name: "House", Icon: House, keywords: "home rent mortgage housing" },
  { name: "Building2", Icon: Building2, keywords: "apartment rent office housing" },
  { name: "BedDouble", Icon: BedDouble, keywords: "home bedroom furniture sleep" },
  { name: "Sofa", Icon: Sofa, keywords: "home furniture living" },
  { name: "Armchair", Icon: Armchair, keywords: "home furniture living" },
  { name: "Lamp", Icon: Lamp, keywords: "home light furniture" },
  { name: "DoorOpen", Icon: DoorOpen, keywords: "home entrance" },
  { name: "Bath", Icon: Bath, keywords: "home bathroom water" },
  { name: "Refrigerator", Icon: Refrigerator, keywords: "home appliance kitchen fridge" },
  { name: "WashingMachine", Icon: WashingMachine, keywords: "home appliance laundry" },
  { name: "Microwave", Icon: Microwave, keywords: "home appliance kitchen" },
  { name: "Lightbulb", Icon: Lightbulb, keywords: "electricity utility power idea" },
  { name: "Plug", Icon: Plug, keywords: "electricity utility power" },
  { name: "Zap", Icon: Zap, keywords: "electricity power energy utility" },
  { name: "Flame", Icon: Flame, keywords: "gas heating utility fire" },
  { name: "Droplet", Icon: Droplet, keywords: "water utility bill" },
  { name: "Wifi", Icon: Wifi, keywords: "internet utility broadband" },
  { name: "Battery", Icon: Battery, keywords: "power energy charge" },
  { name: "Wrench", Icon: Wrench, keywords: "repair maintenance tools diy" },
  { name: "Hammer", Icon: Hammer, keywords: "repair tools diy build" },
  { name: "Drill", Icon: Drill, keywords: "tools diy repair" },
  { name: "Shovel", Icon: Shovel, keywords: "garden tools diy" },
  { name: "Axe", Icon: Axe, keywords: "tools diy" },
  { name: "Ruler", Icon: Ruler, keywords: "tools diy measure" },
  { name: "PaintRoller", Icon: PaintRoller, keywords: "decorating diy home" },
  { name: "Paintbrush", Icon: Paintbrush, keywords: "decorating diy art" },
  { name: "Trees", Icon: Trees, keywords: "garden outdoor nature" },
  { name: "Flower", Icon: Flower, keywords: "garden plants nature" },
  { name: "Sprout", Icon: Sprout, keywords: "garden plants grow" },
  { name: "Leaf", Icon: Leaf, keywords: "nature eco plants" },
  { name: "Recycle", Icon: Recycle, keywords: "waste eco bins rubbish" },
  // Transport
  { name: "Car", Icon: Car, keywords: "transport vehicle drive auto" },
  { name: "Fuel", Icon: Fuel, keywords: "petrol gas gasoline diesel transport" },
  { name: "Bus", Icon: Bus, keywords: "transport public transit" },
  { name: "TrainFront", Icon: TrainFront, keywords: "transport rail commute" },
  { name: "TramFront", Icon: TramFront, keywords: "transport rail metro subway" },
  { name: "Bike", Icon: Bike, keywords: "transport cycle bicycle" },
  { name: "Plane", Icon: Plane, keywords: "transport flight travel airfare" },
  { name: "Truck", Icon: Truck, keywords: "transport delivery moving" },
  { name: "Anchor", Icon: Anchor, keywords: "boat marine ferry transport" },
  // Health & wellbeing
  { name: "HeartPulse", Icon: HeartPulse, keywords: "health medical fitness" },
  { name: "Stethoscope", Icon: Stethoscope, keywords: "health doctor medical clinic" },
  { name: "Pill", Icon: Pill, keywords: "health medicine pharmacy prescription" },
  { name: "Syringe", Icon: Syringe, keywords: "health vaccine medical" },
  { name: "Bandage", Icon: Bandage, keywords: "health first aid injury" },
  { name: "Thermometer", Icon: Thermometer, keywords: "health temperature medical" },
  { name: "Cross", Icon: Cross, keywords: "health medical pharmacy" },
  { name: "Ambulance", Icon: Ambulance, keywords: "health emergency medical" },
  { name: "Hospital", Icon: Hospital, keywords: "health medical clinic" },
  { name: "Dumbbell", Icon: Dumbbell, keywords: "gym fitness exercise sport weights" },
  { name: "Volleyball", Icon: Volleyball, keywords: "sport ball fitness" },
  { name: "Goal", Icon: Goal, keywords: "sport football soccer" },
  { name: "PersonStanding", Icon: PersonStanding, keywords: "fitness health exercise" },
  { name: "Accessibility", Icon: Accessibility, keywords: "health care support" },
  { name: "Scissors", Icon: Scissors, keywords: "haircut salon grooming barber" },
  { name: "Brush", Icon: Brush, keywords: "grooming beauty cosmetics" },
  { name: "Cigarette", Icon: Cigarette, keywords: "tobacco smoking vice" },
  // Family, pets, people
  { name: "Baby", Icon: Baby, keywords: "child kids family childcare" },
  { name: "Backpack", Icon: Backpack, keywords: "school kids education" },
  { name: "Users", Icon: Users, keywords: "family friends people group" },
  { name: "User", Icon: User, keywords: "personal me people" },
  { name: "Handshake", Icon: Handshake, keywords: "deal business services" },
  { name: "Dog", Icon: Dog, keywords: "pet animal vet" },
  { name: "Cat", Icon: Cat, keywords: "pet animal vet" },
  { name: "PawPrint", Icon: PawPrint, keywords: "pet animal vet" },
  { name: "Bird", Icon: Bird, keywords: "pet animal" },
  { name: "Bone", Icon: Bone, keywords: "pet dog animal" },
  // Learning, work, tech
  {
    name: "GraduationCap",
    Icon: GraduationCap,
    keywords: "education tuition school university learning",
  },
  { name: "Book", Icon: Book, keywords: "books reading education" },
  { name: "BookOpen", Icon: BookOpen, keywords: "books reading study" },
  { name: "Library", Icon: Library, keywords: "books education study" },
  { name: "School", Icon: School, keywords: "education kids fees" },
  { name: "Pencil", Icon: Pencil, keywords: "stationery writing school" },
  { name: "Briefcase", Icon: Briefcase, keywords: "work business job office" },
  { name: "Laptop", Icon: Laptop, keywords: "computer tech work software" },
  { name: "Monitor", Icon: Monitor, keywords: "computer tech screen" },
  { name: "Smartphone", Icon: Smartphone, keywords: "phone mobile tech" },
  { name: "Phone", Icon: Phone, keywords: "call mobile bill" },
  { name: "Printer", Icon: Printer, keywords: "office tech" },
  { name: "Server", Icon: Server, keywords: "tech hosting cloud" },
  { name: "Cloud", Icon: Cloud, keywords: "tech subscription storage saas" },
  { name: "Code", Icon: Code, keywords: "software tech developer" },
  { name: "Mail", Icon: Mail, keywords: "post letter mail" },
  { name: "Send", Icon: Send, keywords: "transfer send" },
  { name: "Factory", Icon: Factory, keywords: "work industry business" },
  { name: "Warehouse", Icon: Warehouse, keywords: "storage business logistics" },
  // Leisure & travel
  { name: "Film", Icon: Film, keywords: "movies cinema entertainment" },
  { name: "Clapperboard", Icon: Clapperboard, keywords: "movies cinema film" },
  { name: "Tv", Icon: Tv, keywords: "streaming television subscription" },
  { name: "Music", Icon: Music, keywords: "spotify entertainment audio" },
  { name: "Headphones", Icon: Headphones, keywords: "music audio podcast" },
  { name: "Gamepad2", Icon: Gamepad2, keywords: "games gaming console entertainment" },
  { name: "Ticket", Icon: Ticket, keywords: "events concert cinema entertainment" },
  { name: "Popcorn", Icon: Popcorn, keywords: "cinema movies snack" },
  { name: "Camera", Icon: Camera, keywords: "photography hobby" },
  { name: "Palette", Icon: Palette, keywords: "art hobby craft" },
  { name: "Drama", Icon: Drama, keywords: "theatre arts entertainment" },
  { name: "Dice5", Icon: Dice5, keywords: "games gambling hobby" },
  { name: "Trophy", Icon: Trophy, keywords: "sport achievement prize" },
  { name: "Medal", Icon: Medal, keywords: "sport achievement award" },
  { name: "MapPin", Icon: MapPin, keywords: "travel location place" },
  { name: "Map", Icon: MapIcon, keywords: "travel navigation trip" },
  { name: "Compass", Icon: Compass, keywords: "travel navigation adventure" },
  { name: "Luggage", Icon: Luggage, keywords: "travel holiday vacation trip" },
  { name: "Tent", Icon: Tent, keywords: "camping holiday outdoor" },
  { name: "Mountain", Icon: Mountain, keywords: "outdoor hiking travel" },
  { name: "Umbrella", Icon: Umbrella, keywords: "weather beach holiday" },
  { name: "Sun", Icon: Sun, keywords: "holiday weather summer" },
  { name: "Snowflake", Icon: Snowflake, keywords: "winter weather cold heating" },
  { name: "Wind", Icon: Wind, keywords: "weather air" },
  { name: "Hotel", Icon: Hotel, keywords: "travel accommodation stay" },
  { name: "Rocket", Icon: Rocket, keywords: "startup launch growth" },
  { name: "Sparkles", Icon: Sparkles, keywords: "misc special magic" },
  { name: "Star", Icon: Star, keywords: "favorite rating special" },
  // Money & admin
  { name: "Wallet", Icon: Wallet, keywords: "money cash spending" },
  { name: "Banknote", Icon: Banknote, keywords: "money cash income salary" },
  { name: "Coins", Icon: Coins, keywords: "money savings change" },
  { name: "PiggyBank", Icon: PiggyBank, keywords: "savings goal money" },
  { name: "CreditCard", Icon: CreditCard, keywords: "card payment bank debt" },
  { name: "DollarSign", Icon: DollarSign, keywords: "money income cash" },
  { name: "HandCoins", Icon: HandCoins, keywords: "income donation salary money" },
  { name: "Landmark", Icon: Landmark, keywords: "bank tax government fees" },
  { name: "Receipt", Icon: Receipt, keywords: "bill invoice tax expense" },
  { name: "Calculator", Icon: Calculator, keywords: "tax accounting fees" },
  { name: "Percent", Icon: Percent, keywords: "interest tax discount" },
  { name: "ChartPie", Icon: ChartPie, keywords: "investing budget report" },
  { name: "TrendingUp", Icon: TrendingUp, keywords: "investing stocks growth" },
  { name: "Scale", Icon: Scale, keywords: "tax legal fees justice" },
  { name: "ShieldCheck", Icon: ShieldCheck, keywords: "insurance protection security" },
  { name: "Lock", Icon: Lock, keywords: "security savings insurance" },
  { name: "Key", Icon: Key, keywords: "rent deposit access housing" },
  { name: "Award", Icon: Award, keywords: "bonus reward achievement" },
  { name: "Flag", Icon: Flag, keywords: "goal milestone" },
  { name: "Bookmark", Icon: Bookmark, keywords: "saved misc" },
  { name: "Bell", Icon: Bell, keywords: "subscription reminder alert" },
  { name: "Calendar", Icon: Calendar, keywords: "recurring monthly subscription date" },
  { name: "Clock", Icon: Clock, keywords: "recurring time hourly" },
  { name: "Church", Icon: Church, keywords: "donation charity faith" },
  { name: "Heart", Icon: Heart, keywords: "charity donation love giving" },
];

const ICON_BY_NAME = new Map(CATEGORY_ICONS.map((e) => [e.name, e.Icon]));

/** The component for a stored icon name, or `undefined` if this build doesn't
 * carry it (so the caller falls back to the colour dot). */
export function categoryIcon(name: string | null): LucideIcon | undefined {
  return name ? ICON_BY_NAME.get(name) : undefined;
}

/** Filter the catalog by a query, matched against each icon's name and its
 * keywords (every whitespace-separated term must match somewhere). Empty query
 * returns the whole catalog. */
export function searchCategoryIcons(query: string): readonly CategoryIcon[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return CATEGORY_ICONS;
  return CATEGORY_ICONS.filter((e) => {
    const hay = `${e.name} ${e.keywords}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

/**
 * A category's mark: its chosen icon (tinted with its colour), or — when it has
 * none — the deterministic colour dot it has always worn (§12.7 signature #2).
 * A fixed-width slot so a list of some-icon, some-dot rows still aligns.
 */
export function CategoryGlyph({
  icon,
  color,
  className,
  muted,
}: {
  icon: string | null;
  /** The category's colour (resolved by the caller). */
  color: string | undefined;
  className?: string;
  /** Dim it (archived rows). */
  muted?: boolean;
}) {
  // `createElement`, not `<Icon />`: the component comes from a render-time
  // lookup, and rendering it as JSX from a local binding trips
  // `react-hooks/static-components`. This is a lookup of an existing catalog
  // component, not a new one per render.
  const iconComp = categoryIcon(icon);
  return (
    <span
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center",
        muted && "opacity-50",
        className,
      )}
      aria-hidden
    >
      {iconComp ? (
        createElement(iconComp, { className: "size-4", style: { color } })
      ) : (
        <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
      )}
    </span>
  );
}
