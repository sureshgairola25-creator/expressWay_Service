document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('booking-form').addEventListener('submit', async (event) => {
        event.preventDefault();

        const amount = document.getElementById('amount').value;
        const email = document.getElementById('email').value;
        const phone = document.getElementById('phone').value;
        const bookingId = document.getElementById('bookingId').value;
        const messageDiv = document.getElementById('message');

        messageDiv.textContent = 'Creating payment order...';

        try {
            const response = await fetch('/payment/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    order_amount: parseFloat(amount),
                    customer_details: {
                        customer_email: email,
                        customer_phone: phone,
                    },
                    bookingId: bookingId,
                }),
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Failed to create payment order.');
            }

            const paymentSessionId = result.data.payment_session_id;

            if (!paymentSessionId) {
                throw new Error('Payment session ID not received from the server.');
            }

            messageDiv.textContent = 'Redirecting to payment...';

            const cashfree = new Cashfree({ mode: "sandbox" });
            cashfree.checkout({
                paymentSessionId: paymentSessionId
            }).then((checkoutResult) => {
                console.log(checkoutResult, 'checkoutResult');
                
                if (checkoutResult.error) {
                    messageDiv.textContent = `Payment Error: ${checkoutResult.error.message}`;
                }
                if (checkoutResult.redirect) {
                    console.log('Redirecting for payment...');
                }
            });

        } catch (error) {
            messageDiv.textContent = `Error: ${error.message}`;
            console.error('Frontend Error:', error);
        }
    });
});
