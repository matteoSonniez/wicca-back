const Specialty = require('../models/specialties.model');

// Construit une regex tolérante aux accents à partir d'une chaîne utilisateur
function buildDiacriticInsensitivePattern(input) {
  const map = {
    a: "aàáâãäåā",
    c: "cç",
    e: "eèéêëēĕėęě",
    i: "iìíîïīĭįı",
    n: "nñńňŉŋ",
    o: "oòóôõöōŏő",
    u: "uùúûüūŭůűų",
    y: "yỳýÿŷ",
    s: "sśŝşš",
    z: "zźżž",
    g: "gğǵĝğġģ",
    l: "lĺļľł",
    r: "rŕŗř",
    t: "tţť",
  };
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const chars = Array.from(input || "");
  let pattern = "";
  for (const ch of chars) {
    const lower = ch.toLowerCase();
    if (map[lower]) {
      const cls = Array.from(map[lower])
        .map((x) => escapeRegex(x))
        .join("");
      pattern += `[${cls}]`;
    } else {
      pattern += escapeRegex(ch);
    }
  }
  return pattern;
}

// Créer une nouvelle spécialité
exports.createSpecialty = async (req, res) => {
  try {
    const { name, color, icon, show } = req.body;
    const specialty = new Specialty({
      name,
      color: color || null,
      icon: icon || null,
      show: show === true
    });
    await specialty.save();
    res.status(201).json(specialty);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Récupérer toutes les spécialités avec les sous-spécialités peuplées
exports.getAllSpecialties = async (req, res) => {
  try {
    const specialties = await Specialty.find().populate('subSpecialties');
    res.status(200).json(specialties);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.searchSpecialties = async (req, res) => {
  try {
    const { search } = req.body;
    console.log(search, "search");
    if (!search) {
      return res.status(400).json({ message: "Le champ de recherche est requis." });
    }
    const pattern = buildDiacriticInsensitivePattern(String(search).trim());
    const specialties = await Specialty.find({
      name: { $regex: pattern, $options: 'i' }
    }).populate('subSpecialties');
    res.status(200).json(specialties);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la recherche de spécialités", error: error.message });
  }
}; 

// Mettre à jour une spécialité
exports.updateSpecialty = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color, icon, show } = req.body || {};
    const update = {};
    if (typeof name === 'string') update.name = name;
    if (typeof color === 'string' || color === null) update.color = color ?? null;
    if (typeof icon === 'string' || icon === null) update.icon = icon ?? null;
    if (typeof show === 'boolean') update.show = show === true;
    if (Object.keys(update).length === 0) return res.status(400).json({ message: 'Aucun champ valide fourni' });
    const specialty = await Specialty.findByIdAndUpdate(id, update, { new: true, runValidators: true, context: 'query' })
      .populate('subSpecialties');
    if (!specialty) return res.status(404).json({ message: 'Spécialité non trouvée' });
    res.status(200).json({ message: 'Spécialité mise à jour', specialty });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};