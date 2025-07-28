const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(session({
  secret: 'secret',
  resave: false,
  saveUninitialized: true
}));
app.use(flash());

const db = mysql.createConnection({
  host: 'c237-all.mysql.database.azure.com',
  port: 3306,
  user: 'c237admin',
  password: 'c2372025!',
  database: 'c237_team122'
})

// A - Basic Routes (Jia Xuan)

const checkAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    } else {
        req.flash('error', 'Please log in to view this resource');
        res.redirect('/login');
    }
};

const checkAdmin = (req, res, next) => {
    if (req.session.user.role === 'admin') {
        return next();
    } else {
        req.flash('error', 'Access denied');
        res.redirect('/dashboard');
    }
};

const validateRegistration = (req, res, next) => {
    const { username, email, password, phone} = req.body;

    if (!username || !email || !password || !phone) {
        return res.status(400).send('All fields are required.');
    }
    
    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 or more characters long');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};


app.get('/manageUsers', checkAuthenticated, checkAdmin, (req, res) => {
  db.query('SELECT * FROM users', (err, results) => {
    if (err) {
      req.flash('error', 'Failed to load users');
      return res.redirect('/admin');
    }
    res.render('manageUsers', {
      users: results,
      messages: {
        error: req.flash('error'),
        success: req.flash('success')
      },
      userSession: req.session.user
    });
  });
});

app.post('/deleteUser/:id', checkAuthenticated, checkAdmin, (req, res) => {
  const userId = req.params.id;

  if (userId == req.session.user.id) {
    req.flash('error', 'You cannot delete your own account.');
    return res.redirect('/manageUsers');
  }

  db.query('DELETE FROM users WHERE id = ?', [userId], (err) => {
    if (err) {
      req.flash('error', 'Failed to delete user.');
    } else {
      req.flash('success', 'User deleted successfully.');
    }
    res.redirect('/manageUsers');
  });
});




app.get('/', (req, res) => {
  res.render('index');
});

app.get('/register', (req, res) => {
  res.render('register', {
    messages: {
      error: req.flash('error'),
      success: req.flash('success')
    }
  });
});


app.post('/register', validateRegistration, (req, res) => {
  const { username, email, password, phone } = req.body;
  const query = 'INSERT INTO users (username, email, password, phone) VALUES (?, ?, SHA1(?), ?)';
  db.query(query, [username, email, password, phone], (err, result) => {
    if (err) {
        throw err;
    }
    console.log(result); 
    req.flash('success', 'Registration successful! Please log in.');
    res.redirect('/login');
});

});

app.get('/login', (req, res) => {
  res.render('login', {
    messages: {
      error: req.flash('error'),
      success: req.flash('success')
    }
  });
});


app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const query = 'SELECT * FROM users WHERE username = ? AND password = SHA1(?)';

  db.query(query, [username, password], (err, results) => {
    if (err || results.length === 0) {
      req.flash('error', 'Invalid username or password.');
      return res.redirect('/login');
    }

    const user = results[0];
    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role
    };

    // Redirect based on role
    if (user.role === 'admin') {
      res.redirect('/admin');
    } else {
      res.redirect('/dashboard');
    }
  });
});



app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.get('/admin', checkAuthenticated, checkAdmin, (req, res) => {
  res.render('admin', {user : req.session.user });
});

// B - Add Expense (Sudhan)
app.get('/add', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('add');
});

app.post('/add', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const { amount, category, description, date } = req.body;
  const userId = req.session.user.id;

  if (!amount || !category || !description || !date) {
    return res.send("All fields are required.");
  }

  const query = 'INSERT INTO expenses (amount, category, description, date, userId) VALUES (?, ?, ?, ?, ?)';
  db.query(query, [amount, category, description, date, userId], (err) => {
    if (err) return res.send('Failed to add expense.');
    res.redirect('/dashboard');
  });
})
// C - View/List Items (Isaac)
app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const userId = req.session.user.id;
  const query = 'SELECT * FROM expenses WHERE userId = ?';

  db.query(query, [userId], (err, results) => {
    if (err) return res.send('Failed to retrieve expenses.');

    const totalSpent = results.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
    const today = new Date().toLocaleDateString('en-SG', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'Asia/Singapore'
    });

    res.render('dashboard', {
      user: req.session.user,
      expenses: results,
      totalSpent: totalSpent.toFixed(2),
      today
    });
  });
});


// F Search & Filter (Clinton)


app.get('/search', async (req, res) => {
  //  Redirect to login if user is not logged in
  if (!req.session.user) return res.redirect('/login');

  const promiseDb = db.promise(); // 🔄 Use Promise-based queries
  const currentUserId = req.session.user.id;
  const isAdmin = req.session.user.role === 'admin';

  //  Destructure query params from URL
  const { keyword, category, from, to, sort, month, userId } = req.query;

  //  Start building SQL query
  let sql = `SELECT * FROM expenses WHERE 1=1`;
  const params = [];

  //  If normal user, restrict to their own expenses
  if (!isAdmin) {
    sql += " AND userId = ?";
    params.push(currentUserId);
  }
  //  If admin and userId is chosen, filter by that user
  else if (userId) {
    sql += " AND userId = ?";
    params.push(userId);
  }

  //  Filter: Description keyword
  if (keyword) {
    sql += " AND description LIKE ?";
    params.push(`%${keyword}%`);
  }

  //  Filter: Category
  if (category && category !== 'all') {
    sql += " AND category = ?";
    params.push(category);
  }

  //  Filter: Specific month (e.g., '2025-07')
  if (month) {
    sql += " AND DATE_FORMAT(date, '%Y-%m') = ?";
    params.push(month);
  }

  //  Filter: From date
  if (from) {
    sql += " AND date >= ?";
    params.push(from);
  }

  //  Filter: To date
  if (to) {
    sql += " AND date <= ?";
    params.push(to);
  }

  //  Sorting options
  if (sort === 'amount_asc') sql += " ORDER BY amount ASC";
  else if (sort === 'amount_desc') sql += " ORDER BY amount DESC";
  else if (sort === 'category_asc') sql += " ORDER BY category ASC";
  else if (sort === 'category_desc') sql += " ORDER BY category DESC";
  else sql += " ORDER BY date DESC"; // Default: most recent first

  try {
    //  Execute final expenses query
    const [expenses] = await promiseDb.query(sql, params);

    //  Calculate total spending
    const total = Array.isArray(expenses)
      ? expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0)
      : 0;

    let userCategory, topCategory, topSpender;

    //  Admin statistics
    if (isAdmin) {
      //  Most spent category across all users
      [[topCategory]] = await promiseDb.query(`
        SELECT category, SUM(amount) AS total
        FROM expenses
        GROUP BY category
        ORDER BY total DESC
        LIMIT 1
      `);

      //  Top spender (user with highest total)
      [[topSpender]] = await promiseDb.query(`
        SELECT u.username, SUM(e.amount) AS total
        FROM users u
        JOIN expenses e ON u.id = e.userId
        GROUP BY u.id
        ORDER BY total DESC
        LIMIT 1
      `);

      //  Most spent category by selected user
      [[userCategory]] = await promiseDb.query(`
        SELECT category, SUM(amount) AS total
        FROM expenses
        WHERE userId = ?
        GROUP BY category
        ORDER BY total DESC
        LIMIT 1
      `, [userId || currentUserId]);

    } else {
      //  Normal user: only show their top category
      [[userCategory]] = await promiseDb.query(`
        SELECT category, SUM(amount) AS total
        FROM expenses
        WHERE userId = ?
        GROUP BY category
        ORDER BY total DESC
        LIMIT 1
      `, [currentUserId]);

      //  Default top spender = yourself (for consistency)
      topCategory = userCategory;
      topSpender = { username: req.session.user.username, total };
    }

    //  All users for admin dropdown
    const [users] = await promiseDb.query("SELECT id, username FROM users");

    //  All months available in the data (dynamic)
    const [monthsData] = await promiseDb.query(`
      SELECT DISTINCT DATE_FORMAT(date, '%Y-%m') AS value,
                      DATE_FORMAT(date, '%M %Y') AS label
      FROM expenses
      ${isAdmin && userId ? "WHERE userId = ?" : "WHERE userId = ?"}
      ORDER BY value DESC
    `, [userId || currentUserId]);

    //  All categories available in the data (dynamic)
    const [categoryData] = await promiseDb.query(`
      SELECT DISTINCT category FROM expenses
      ${isAdmin && userId ? "WHERE userId = ?" : "WHERE userId = ?"}
    `, [userId || currentUserId]);

    const allCategories = categoryData.map(row => row.category);

    //  Render final page with data
    res.render('search_filter', {
      expenses,
      keyword,
      category,
      from,
      to,
      sort,
      total,
      month,
      userId,
      userCategory,
      topCategory,
      topSpender,
      users,
      allMonths: monthsData,
      user: req.session.user,
      allCategories
    });

  } catch (err) {
    //  Error handling
    console.error("Search route error:", err);
    res.status(500).send('Something went wrong in /search.');
  }
});


// E - Delete Expense (Hans)
app.get('/delete/:id', (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const expenseId = req.params.id;
  const userId = req.session.user.id;

  const query = 'DELETE FROM expenses WHERE id = ? AND userId = ?';
  db.query(query, [expenseId, userId], (err) => {
    if (err) return res.status(500).send('Failed to delete expense.');
    res.redirect('/search');
  });
});

// (Hans' extra stuff) overview handler
app.get('/overview', (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const userId = req.session.user.id;

  const chartQuery = `
    SELECT category, SUM(amount) AS total 
    FROM expenses 
    WHERE userId = ?
    GROUP BY category
  `;

  const commentQuery = `
    SELECT comment 
    FROM users 
    WHERE id = ?
  `;

  db.query(chartQuery, [userId], (err, chartResults) => {
    if (err) return res.status(500).send('Error fetching chart data');

    db.query(commentQuery, [userId], (err, userResults) => {
      if (err) return res.status(500).send('Error fetching user comment');

      const comment = userResults[0]?.comment || null;

      res.render('overview', {
        user: req.session.user,
        chartData: chartResults,
        comment
      });
    });
  });
});

app.post('/comment', (req, res) => {
  const userId = req.session.user.id;
  const { comment } = req.body;

  db.query('UPDATE users SET comment = ? WHERE id = ?', [comment, userId], (err) => {
    if (err) return res.status(500).send('Failed to update comment.');
    res.redirect('/overview');
  });
});
////////////////////////////////////////////////////////////////////////////////


// D - Edit Expense (Derrick)
app.get('/edit/:id', (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const expenseId = req.params.id;
  const userId = req.session.user.id;

  const query = 'SELECT * FROM expenses WHERE id = ? AND userId = ?';
  db.query(query, [expenseId, userId], (err, results) => {
    if (err || results.length === 0) {
      return res.send(`
        <script>
          alert("Expense not found or not authorized.");
          window.location.href = "/search";
        </script>
      `);
    }

    res.render('edit', {
      expense: results[0]
    });
  });
});

app.post('/edit/:id', (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const expenseId = req.params.id;
  const userId = req.session.user.id;
  const { description, amount, category, date } = req.body;

  if (!description || !amount || !category || !date) {
    return res.send(`
      <script>
        alert("All fields are required.");
        window.location.href = "/edit/${expenseId}";
      </script>
    `);
  }

  const query = `
    UPDATE expenses 
    SET description = ?, amount = ?, category = ?, date = ?
    WHERE id = ? AND userId = ?
  `;

  db.query(query, [description, amount, category, date, expenseId, userId], (err) => {
    if (err) {
      console.error(err);
      return res.send(`
        <script>
          alert("Failed to update expense.");
          window.location.href = "/edit/${expenseId}";
        </script>
      `);
    }

    res.send(`
      <script>
        alert("Expense updated successfully.");
        window.location.href = "/search";
      </script>
    `);
  });
});

// Start Server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/search`);
});
