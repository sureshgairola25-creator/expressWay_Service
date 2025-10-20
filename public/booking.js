document.addEventListener('DOMContentLoaded', async () => {
    const bookingDetailsContainer = document.getElementById('booking-details');

    try {
        // Extract the full order_id from the URL path (e.g., /bookings/ORDER_1_1760457457445)
        const path = window.location.pathname;
        const orderId = path.split('/')[2];

        if (!orderId) {
            throw new Error('Order ID not found in URL.');
        }

        // Extract the bookingId from the orderId string
        const bookingId = orderId.split('_')[1];

        if (!bookingId) {
            throw new Error('Booking ID could not be parsed from the Order ID.');
        }

        // Fetch the final booking details from the backend
        const response = await fetch(`/payment/success/${bookingId}`);
        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Failed to fetch booking details.');
        }

        const booking = result.data;
        renderBookingDetails(booking);

    } catch (error) {
        bookingDetailsContainer.innerHTML = `<h2>Error</h2><p class="failed">${error.message}</p>`;
        console.error('Frontend Error:', error);
    }
});

function renderBookingDetails(booking) {
    const container = document.getElementById('booking-details');
    let statusClass = '';
    let statusMessage = '';

    if (booking.paymentStatus === 'success' && booking.bookingStatus === 'confirmed') {
        statusClass = 'success';
        statusMessage = 'Your booking is confirmed!';
    } else {
        statusClass = 'failed';
        statusMessage = 'Payment failed or is pending. Please try again or contact support.';
    }

    container.innerHTML = `
        <h2 class="${statusClass}">${statusMessage}</h2>
        <div class="details">
            <p><strong>Booking ID:</strong> ${booking.id}</p>
            <p><strong>Total Amount:</strong> ₹${booking.totalAmount}</p>
            <p><strong>Payment Status:</strong> ${booking.paymentStatus}</p>
            <p><strong>Booking Status:</strong> ${booking.bookingStatus}</p>
            <p><strong>Transaction ID:</strong> ${booking.transactionId || 'N/A'}</p>
            <p><strong>Payment Mode:</strong> ${booking.paymentMode || 'N/A'}</p>
        </div>
    `;
}
