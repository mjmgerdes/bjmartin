module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const { adminPassword, id, name, category, city, state, lat, lng,
          description, memory, website, imageUrls } = body;

  if (!adminPassword || adminPassword !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!name || lat == null || lng == null) {
    return res.status(400).json({ error: 'name, lat, and lng are required' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
  const headers = {
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'apikey':        SERVICE_KEY,
    'Content-Type':  'application/json',
    'Prefer':        'return=representation',
  };

  const payload = {
    name,
    category:   category   || 'Other',
    city:       city       || null,
    state:      state      || null,
    lat:        parseFloat(lat),
    lng:        parseFloat(lng),
    description: description || null,
    memory:     memory     || null,
    website:    website    || null,
    image_urls: imageUrls  || [],
  };

  try {
    let response;
    if (id) {
      // UPDATE existing place
      response = await fetch(
        `${SUPABASE_URL}/rest/v1/places?id=eq.${encodeURIComponent(id)}`,
        { method: 'PATCH', headers, body: JSON.stringify(payload) }
      );
    } else {
      // INSERT new place
      response = await fetch(
        `${SUPABASE_URL}/rest/v1/places`,
        { method: 'POST', headers, body: JSON.stringify(payload) }
      );
    }

    if (!response.ok) {
      const err = await response.text();
      console.error('Supabase error:', err);
      return res.status(500).json({ error: 'Database error', detail: err });
    }

    const rows = await response.json();
    const place = Array.isArray(rows) ? rows[0] : rows;
    return res.status(200).json(place);
  } catch (err) {
    console.error('add-place error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
