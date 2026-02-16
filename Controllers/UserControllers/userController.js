// Note the change from 'user' to 'User' to match the usage below.
const User = require('../../Models/users');

const getUserProfile = async (req, res) => {
    try {
        // Find the user by the ID from the JWT payload
        const user = await User.findById(req.user.id).select('-password');
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json(user);

    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = { getUserProfile };