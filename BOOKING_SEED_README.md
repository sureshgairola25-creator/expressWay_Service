# Booking Data Seeder

This script creates comprehensive dummy data for the booking system including users, bookings, and booked seats.

## Features

- ✅ **5 Verified Users** with login credentials
- ✅ **20+ Bookings** with realistic scenarios
- ✅ **37+ Booked Seats** across different trips
- ✅ **Mixed Payment Statuses**: completed, pending, failed
- ✅ **Mixed Booking Statuses**: active, initiated, cancelled, completed
- ✅ **Proper Associations**: Users → Bookings → BookedSeats → SeatPricing

## Usage

### Prerequisites
1. Run the main seeder first to create trips, cars, and locations:
   ```bash
   node seed.js
   ```

2. Then run the booking seeder:
   ```bash
   node booking-seed.js
   ```

## Created Data

### Users (5 total)
All users have verified accounts and can be used for testing:

| Email | Password | Name | Phone |
|-------|----------|------|-------|
| john.doe@example.com | password123 | John Doe | 9876543210 |
| jane.smith@example.com | password123 | Jane Smith | 9876543211 |
| mike.johnson@example.com | password123 | Mike Johnson | 9876543212 |
| sarah.wilson@example.com | password123 | Sarah Wilson | 9876543213 |
| david.brown@example.com | password123 | David Brown | 9876543214 |

### Booking Scenarios
The seeder creates various realistic booking scenarios:

1. **Single Seat Bookings** - Individual travelers
2. **Multi-Seat Bookings** - Family/friend groups
3. **Completed Payments** - Successful transactions
4. **Pending Payments** - Payment in progress
5. **Failed Payments** - Payment failures
6. **Active Bookings** - Confirmed trips
7. **Cancelled Bookings** - User cancellations
8. **Completed Bookings** - Finished trips

## Database Impact

- **Users Table**: 5 new verified users
- **Bookings Table**: 23 new bookings with various statuses
- **BookedSeats Table**: 37 seat bookings linked to bookings
- **SeatPricing Table**: Updated with booking status

## Testing Scenarios

You can now test:
- User login and authentication
- Booking creation and management
- Payment processing workflows
- Seat availability checking
- Booking status updates
- Cancellation flows
- Admin booking management

## Reset Data

To reset and reseed with fresh data:

```bash
# Clear existing data and recreate
node seed.js          # Creates trips, cars, locations
node booking-seed.js  # Creates users and bookings
```
