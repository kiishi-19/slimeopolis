-- Slimeopolis Seed Data
-- 24 products: 3 per country × 8 countries
-- Countries: Japan, Brazil, France, South Korea, India, Australia, Mexico, Italy

-- ─── Japan 🇯🇵 ────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO products (id, name, slug, description, price_cents, country_code, country_name, category, texture, scent, color_hex, stock_quantity, is_featured)
VALUES
(
  'prod_jp_001',
  'Sakura Cloud Slime',
  'sakura-cloud-slime',
  'Inspired by the fleeting beauty of Japanese cherry blossom season, this ultra-fluffy cloud slime melts in your hands like morning fog over Mount Fuji. Soft pink with delicate silver shimmer, scented with authentic sakura fragrance.',
  1499,
  'JP', 'Japan', 'cloud', 'fluffy', 'Sakura blossom', '#FFB7C5', 85, 1
),
(
  'prod_jp_002',
  'Matcha Butter Slime',
  'matcha-butter-slime',
  'A rich, velvety butter slime that captures the ceremonial matcha culture of Kyoto''s ancient tea houses. Creamy sage green with a smooth, spreadable texture that holds its shape beautifully.',
  1299,
  'JP', 'Japan', 'butter', 'thick', 'Green tea', '#8DB87E', 120, 0
),
(
  'prod_jp_003',
  'Raindrop Clear Slime',
  'raindrop-clear-slime',
  'Crystal-clear slime inspired by Japan''s famous rain art and transparent water aesthetics. Contains tiny holographic glitter stars that swirl like a galaxy when stretched. Completely scentless for sensory sensitivity.',
  1699,
  'JP', 'Japan', 'clear', 'jiggly', NULL, '#E8F4FD', 60, 0
),

-- ─── Brazil 🇧🇷 ───────────────────────────────────────────────────────────────
(
  'prod_br_001',
  'Tropical Floam',
  'tropical-floam',
  'Bursting with the energy of Rio Carnival! This vibrant floam slime is packed with micro-foam beads in electric yellow, emerald, and magenta — the colors of the Amazon rainforest canopy at golden hour.',
  1599,
  'BR', 'Brazil', 'floam', 'crunchy', 'Passion fruit', '#F9C74F', 95, 1
),
(
  'prod_br_002',
  'Carnival Glitter Slime',
  'carnival-glitter-slime',
  'Samba your way through this ultra-glittery clear slime packed with chunky holographic confetti. Every pull reveals a new burst of color, just like the feathered costumes at the Sambadrome in Rio.',
  1799,
  'BR', 'Brazil', 'glitter', 'stretchy', 'Mango', '#FF6B6B', 75, 0
),
(
  'prod_br_003',
  'Amazon Green Crunchy',
  'amazon-green-crunchy',
  'Deep jungle green crunchy slime loaded with fishbowl beads that pop and crunch like you''re walking through the Amazon undergrowth. Rich earthy base scented with bergamot and fern.',
  1399,
  'BR', 'Brazil', 'crunchy', 'crunchy', 'Bergamot & fern', '#2D6A4F', 110, 0
),

-- ─── France 🇫🇷 ───────────────────────────────────────────────────────────────
(
  'prod_fr_001',
  'Lavande Butter Slime',
  'lavande-butter-slime',
  'A sublime French butter slime crafted in the spirit of Provence''s endless lavender fields. Pale violet with a smooth, couture texture — effortlessly chic and impossibly soft. Scented with real lavender essential oil.',
  1599,
  'FR', 'France', 'butter', 'thick', 'Lavender', '#C9B1D9', 90, 1
),
(
  'prod_fr_002',
  'Parisian Glossy Slime',
  'parisian-glossy-slime',
  'As polished as the Seine at midnight. This high-gloss clear slime has a mirror-like finish inspired by Parisian lacquerware and the glass pyramids of the Louvre. Pulls into gorgeous, web-like strings.',
  1899,
  'FR', 'France', 'glossy', 'stretchy', 'Champagne rose', '#F8E1E7', 55, 0
),
(
  'prod_fr_003',
  'Crème Brûlée Slime',
  'creme-brulee-slime',
  'The dessert, reimagined. This warm caramel-toned butter slime is scented with real vanilla bean and caramelized sugar, making it dangerously irresistible. Thick, spreadable, and absolutely magnifique.',
  1499,
  'FR', 'France', 'butter', 'thick', 'Vanilla caramel', '#D4A853', 80, 0
),

-- ─── South Korea 🇰🇷 ──────────────────────────────────────────────────────────
(
  'prod_kr_001',
  'K-Pop Glitter Clear',
  'kpop-glitter-clear',
  'Stage-ready and camera-perfect. This ultra-clear slime is packed with star-shaped glitter and iridescent chunks inspired by the dazzling stage outfits of K-Pop icons. Smells like your favorite idol''s signature perfume.',
  1799,
  'KR', 'South Korea', 'glitter', 'stretchy', 'Sweet floral musk', '#E8D5FF', 100, 1
),
(
  'prod_kr_002',
  'Boba Tea Chunky Slime',
  'boba-tea-chunky-slime',
  'The slime version of everyone''s favorite drink! Rich brown base with jumbo black bead "pearls" and a swirl of creamy white. Smells exactly like brown sugar milk tea. Strangely satisfying to squeeze.',
  1399,
  'KR', 'South Korea', 'crunchy', 'jiggly', 'Brown sugar milk tea', '#C08B5C', 130, 0
),
(
  'prod_kr_003',
  'Seoul Neon Slime',
  'seoul-neon-slime',
  'Inspired by the electric neon-lit streets of Hongdae at midnight. Electric blue base with glowing green and pink streaks — and yes, it actually glows in the dark. As iconic as the Seoul skyline.',
  1699,
  'KR', 'South Korea', 'glow', 'stretchy', 'Fresh cotton candy', '#4CC9F0', 70, 0
),

-- ─── India 🇮🇳 ────────────────────────────────────────────────────────────────
(
  'prod_in_001',
  'Festival Color Slime',
  'festival-color-slime',
  'Holi in your hands! This vibrant multicolor swirl slime captures the explosive joy of India''s Festival of Colors. Hot pink, saffron orange, and electric blue blend and separate with each pull.',
  1499,
  'IN', 'India', 'cloud', 'fluffy', 'Rose water', '#FF4D8B', 105, 1
),
(
  'prod_in_002',
  'Turmeric Gold Metallic',
  'turmeric-gold-metallic',
  'Sacred and golden. This stunning metallic slime is the exact warm gold of turmeric paste used in Ayurvedic rituals, with a gleaming finish that catches light like temple jewelry. Scented with sandalwood and warm spices.',
  1899,
  'IN', 'India', 'metallic', 'thick', 'Sandalwood & spice', '#E4B429', 65, 0
),
(
  'prod_in_003',
  'Monsoon Blue Slime',
  'monsoon-blue-slime',
  'The first rain on parched earth — petrichor captured in slime form. This deep cobalt blue jiggly slime moves like monsoon water and is scented with geosmin — the real, chemical smell of rain on soil.',
  1599,
  'IN', 'India', 'clear', 'jiggly', 'Petrichor', '#1A6FA8', 88, 0
),

-- ─── Australia 🇦🇺 ────────────────────────────────────────────────────────────
(
  'prod_au_001',
  'Outback Glow Slime',
  'outback-glow-slime',
  'From the red desert heart of Australia. This rust-orange slime charges under light and then glows a warm amber in the dark, like the iconic Uluru at dusk. Stretchy, smooth, and completely otherworldly.',
  1699,
  'AU', 'Australia', 'glow', 'stretchy', 'Eucalyptus & red earth', '#C84B31', 72, 1
),
(
  'prod_au_002',
  'Coral Reef Metallic',
  'coral-reef-metallic',
  'Inspired by the breathtaking Great Barrier Reef before bleaching — vivid teal and coral metallic slime that shimmers like tropical fish scales underwater. A love letter to one of Earth''s greatest natural wonders.',
  1899,
  'AU', 'Australia', 'metallic', 'thick', 'Ocean breeze', '#00B4C5', 58, 0
),
(
  'prod_au_003',
  'Eucalyptus Butter Slime',
  'eucalyptus-butter-slime',
  'Soft as a koala, fresh as the bush after rain. This sage-green butter slime is intensely scented with real eucalyptus oil — cooling, clean, and unmistakably Australian. The most soothing slime in the shop.',
  1499,
  'AU', 'Australia', 'butter', 'thick', 'Eucalyptus', '#7FB685', 115, 0
),

-- ─── Mexico 🇲🇽 ───────────────────────────────────────────────────────────────
(
  'prod_mx_001',
  'Fiesta Confetti Slime',
  'fiesta-confetti-slime',
  '¡Ándale! This explosion of color channels the spirit of a Mexican Día de los Muertos fiesta. Bright marigold yellow base with rainbow confetti and papel picado-shaped glitter. Smells like fresh marigold flowers.',
  1499,
  'MX', 'Mexico', 'glitter', 'stretchy', 'Marigold', '#FFB627', 98, 1
),
(
  'prod_mx_002',
  'Oaxacan Clay Mix',
  'oaxacan-clay-mix',
  'Handcraft-inspired clay slime in the earthy terracotta tones of Oaxacan pottery. Contains real air-dry clay for a unique, moldable-yet-stretchy texture. Each batch has natural color variation, just like hand-thrown ceramics.',
  1799,
  'MX', 'Mexico', 'clay', 'thick', 'Adobe & copal smoke', '#C2714F', 45, 0
),
(
  'prod_mx_003',
  'Talavera Tile Glitter',
  'talavera-tile-glitter',
  'Bold as Puebla''s famous hand-painted ceramic tiles. This cobalt blue and white glitter slime features chunky star and floral-shaped glitter that mirrors the intricate patterns of talavera artisanry.',
  1599,
  'MX', 'Mexico', 'glitter', 'jiggly', 'Fresh citrus', '#1B4FBE', 82, 0
),

-- ─── Italy 🇮🇹 ────────────────────────────────────────────────────────────────
(
  'prod_it_001',
  'Venetian Marble Slime',
  'venetian-marble-slime',
  'As timeless as the Grand Canal. This ivory and grey swirl butter slime is marbled by hand in every batch, capturing the veined elegance of Carrara marble used by Michelangelo himself.',
  1999,
  'IT', 'Italy', 'butter', 'thick', 'White musk', '#F0EDE6', 62, 1
),
(
  'prod_it_002',
  'Gelato Swirl Slime',
  'gelato-swirl-slime',
  'Every flavor, every color. This glossy swirl slime blends pistachio green, strawberry pink, and lemon yellow — just like a three-scoop Italian gelato. Smells genuinely of fresh pistachio cream.',
  1499,
  'IT', 'Italy', 'glossy', 'stretchy', 'Pistachio cream', '#A8D5A2', 95, 0
),
(
  'prod_it_003',
  'Tuscan Sunset Metallic',
  'tuscan-sunset-metallic',
  'Golden hour over the Tuscan hills, bottled. Warm amber-gold metallic slime that shifts between copper and rose gold depending on the light — just like the Chianti countryside at 6pm in late summer.',
  1799,
  'IT', 'Italy', 'metallic', 'thick', 'Cypress & warm amber', '#D4956A', 78, 0
);

-- ─── Seed FTS index ───────────────────────────────────────────────────────────

INSERT INTO products_fts(products_fts) VALUES('rebuild');
