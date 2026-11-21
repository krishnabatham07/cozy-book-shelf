// =====================================
// COZY BOOK SHELF
// SUPABASE CONNECTION
// =====================================

const SUPABASE_URL = "https://ollqdcgnphqwrehqxhmj.supabase.co";

const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_s0wP5R2LrYB9VZDeZljFRA_o2XVpU1O";

// Create Supabase client
const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

console.log("Cozy Book Shelf connected to Supabase!");

// Test Supabase connection
async function testSupabaseConnection() {
    const { data, error } =
        await supabaseClient.auth.getSession();

    if (error) {
        console.error("Supabase Error:", error.message);
    } else {
        console.log("Supabase Auth Service is responding!");
        console.log("Current Session:", data.session);
    }
}

testSupabaseConnection();