console.log("AUTH.JS LOADED SUCCESSFULLY!");
// ========================================
// MY COZY SHELF
// COMPLETE AUTHENTICATION SYSTEM
// ========================================


// ========================================
// 1. REGISTER NEW USER
// ========================================

const registerForm = document.getElementById("register-form");

if (registerForm) {

    registerForm.addEventListener("submit", async function (event) {

        event.preventDefault();

        const name = document.getElementById("full-name").value.trim();
        const email = document.getElementById("register-email").value.trim();
        const password = document.getElementById("register-password").value;
        const confirmPassword = document.getElementById("confirm-password").value;

        const message = document.getElementById("register-message");

        if (password !== confirmPassword) {
            message.textContent = "Passwords do not match!";
            message.style.color = "red";
            return;
        }

        message.textContent = "Creating your account...";
        message.style.color = "blue";

        try {

            const { data, error } = await supabaseClient.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        full_name: name
                    }
                }
            });

            if (error) throw error;

            registerForm.reset();

            if (data.session) {

                message.textContent = "Account created successfully!";
                message.style.color = "green";

                setTimeout(() => {
                    window.location.href = "index.html";
                }, 1500);

            } else {

                message.textContent =
                    "Account created! Please check your email to confirm your account.";

                message.style.color = "green";
            }

        } catch (error) {

            message.textContent = error.message;
            message.style.color = "red";

        }

    });
}


// ========================================
// 2. LOGIN EXISTING USER
// ========================================

const loginForm = document.getElementById("login-form");

if (loginForm) {

    loginForm.addEventListener("submit", async function (event) {

        event.preventDefault();

        const email = document.getElementById("login-email").value.trim();
        const password = document.getElementById("login-password").value;

        const message = document.getElementById("login-message");
        const loginButton = loginForm.querySelector('button[type="submit"]');

        message.textContent = "Logging in...";
        message.style.color = "blue";

        loginButton.disabled = true;

        try {

            const { data, error } =
                await supabaseClient.auth.signInWithPassword({
                    email: email,
                    password: password
                });

            if (error) throw error;

            const userName =
                data.user.user_metadata?.full_name || data.user.email;

            message.textContent = "Welcome back, " + userName + "!";
            message.style.color = "green";

            setTimeout(() => {
                window.location.href = "index.html";
            }, 1000);

        } catch (error) {

            message.textContent = error.message;
            message.style.color = "red";

            loginButton.disabled = false;

        }

    });
}


// ========================================
// 3. UPDATE NAVBAR
// ========================================

function updateNavbar(session) {

    const authButtons = document.getElementById("auth-buttons");
    const userMenu = document.getElementById("user-menu");

    if (!authButtons || !userMenu) return;

    if (session && session.user) {

        authButtons.hidden = true;
        userMenu.hidden = false;

        const profileButton =
            userMenu.querySelector('a[href="profile.html"]');

        if (profileButton) {

            const name =
                session.user.user_metadata?.full_name ||
                session.user.email;

            profileButton.textContent = "Welcome, " + name;
        }

    } else {

        authButtons.hidden = false;
        userMenu.hidden = true;

    }
}


// ========================================
// 4. CHECK LOGIN SESSION
// ========================================

async function initializeNavbar() {

    if (typeof supabaseClient === "undefined") {
        console.error("Supabase client not found!");
        return;
    }

    const { data, error } =
        await supabaseClient.auth.getSession();

    if (error) {
        console.error("Session error:", error.message);
        return;
    }

    updateNavbar(data.session);

    supabaseClient.auth.onAuthStateChange(
        (event, session) => {

            updateNavbar(session);

            console.log("Authentication event:", event);

        }
    );
}


// ========================================
// 5. LOGOUT
// ========================================

const logoutButton = document.getElementById("logout-btn");

if (logoutButton) {

    logoutButton.addEventListener("click", async function () {

        logoutButton.disabled = true;
        logoutButton.textContent = "Logging out...";

        try {

            const { error } =
                await supabaseClient.auth.signOut();

            if (error) throw error;

            window.location.href = "index.html";

        } catch (error) {

            alert("Logout failed: " + error.message);

            logoutButton.disabled = false;
            logoutButton.textContent = "Logout";

        }

    });

}


// ========================================
// 6. START AUTHENTICATION
// ========================================

initializeNavbar();

console.log("My Cozy Shelf Authentication Loaded!");