import express from "express";
import pkg from "pg";
import dotenv from "dotenv";
import cors from "cors";

const { Pool } = pkg;
dotenv.config();

const app = express();
app.use(express.json()); // For parsing application/json
app.use(cors());

// PostgreSQL Connection Pool
const pool = new Pool({
  host: process.env.PGHOST,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  port: process.env.PGPORT,
});

// Health check route
app.get("/", (req, res) => {
  res.send("API is running!");
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Route to insert partner details
app.post("/partners", async (req, res) => {
  const client = await pool.connect();

  try {
    // Begin transaction
    await client.query("BEGIN");

    const {
      partner_name,
      description,
      services,
      country,
      state_province,
      city_dma,
      formats,
      addresses,
      contacts,
      websites,
    } = req.body;

    // Insert into Partners table
    const partnerResult = await client.query(
      `INSERT INTO Partners (partner_name, description, services, country, state_province, city_dma, formats)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING partner_id`,
      [
        partner_name,
        description,
        services,
        country,
        state_province,
        city_dma,
        formats,
      ],
    );

    const partnerId = partnerResult.rows[0].partner_id;

    // Insert into Addresses table
    for (let address of addresses) {
      await client.query(
        `INSERT INTO Addresses (partner_id, address_country, address_state, address_street, address_city, address_zip_code)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          partnerId,
          address.address_country,
          address.address_state,
          address.address_street,
          address.address_city,
          address.address_zip_code,
        ],
      );
    }

    // Insert into Contacts table
    for (let contact of contacts) {
      await client.query(
        `INSERT INTO Contacts (partner_id, contact_name, contact_email, contact_phone)
         VALUES ($1, $2, $3, $4)`,
        [
          partnerId,
          contact.contact_name,
          contact.contact_email,
          contact.contact_phone,
        ],
      );
    }

    // Insert into Websites table
    for (let website of websites) {
      await client.query(
        `INSERT INTO Websites (partner_id, website_url, verified)
         VALUES ($1, $2, $3)`,
        [partnerId, website.website_url, website.verified],
      );
    }

    // Commit transaction
    await client.query("COMMIT");

    res.status(201).json({
      message: "Partner details inserted successfully",
      partner_id: partnerId,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error inserting partner details:", error);
    res.status(500).json({ error: "Error inserting partner details" });
  } finally {
    client.release();
  }
});

// API to get partners with addresses, contacts, and websites
app.get("/partners", async (req, res) => {
  try {
    // Query to fetch partners and related addresses, contacts, and websites
    const partnersQuery = `
      SELECT p.partner_id, p.partner_name, p.description, p.services, p.country,
             p.state_province, p.city_dma, p.formats,
             json_agg(
               json_build_object(
                 'address_country', a.address_country,
                 'address_state', a.address_state,
                 'address_street', a.address_street,
                 'address_city', a.address_city,
                 'address_zip_code', a.address_zip_code
               )
             ) AS addresses,
             json_agg(
               json_build_object(
                 'contact_name', c.contact_name,
                 'contact_email', c.contact_email,
                 'contact_phone', c.contact_phone
               )
             ) AS contacts,
             json_agg(
               json_build_object(
                 'website_url', w.website_url,
                 'verified', w.verified
               )
             ) AS websites
      FROM Partners p
      LEFT JOIN Addresses a ON p.partner_id = a.partner_id
      LEFT JOIN Contacts c ON p.partner_id = c.partner_id
      LEFT JOIN Websites w ON p.partner_id = w.partner_id
      GROUP BY p.partner_id;
    `;

    const { rows } = await pool.query(partnersQuery);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});
