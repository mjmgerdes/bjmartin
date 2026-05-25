module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const { adminPassword, id, imageUrls } = body;

  if (!adminPassword || adminPassword !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!id) return res.status(400).json({ error: 'id is required' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
  const authHeaders  = { 'Authorization': `Bearer ${SERVICE_KEY}`, 'apikey': SERVICE_KEY };

  // Delete storage images first
  if (Array.isArray(imageUrls) && imageUrls.length > 0) {
    const filenames = imageUrls
      .map(url => {
        const match = url.match(/place-images\/(.+)$/);
        return match ? match[1] : null;
      })
      .filter(Boolean);

    if (filenames.length > 0) {
      try {
        await fetch(`${SUPABASE_URL}/storage/v1/object/place-images`, {
          method: 'DELETE',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefixes: filenames }),
        });
      } catch (err) {
        console.error('Storage delete error:', err);
        // non-fatal — continue with row delete
      }
    }
  }

  // Delete row
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/places?id=eq.${encodeURIComponent(id)}`,
      { method: 'DELETE', headers: authHeaders }
    );
    if (!response.ok) {
      const err = await response.text();
      console.error('Supabase delete error:', err);
      return res.status(500).json({ error: 'Delete failed' });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('delete-place error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
