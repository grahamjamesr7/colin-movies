import { Resend } from 'resend';

const FROM = 'Colin Movie Bot <do-not-reply@YOUR_DOMAIN>';

export async function sendEmail(apiKey: string, to: string, subject: string, body: string): Promise<void> {
	const resend = new Resend(apiKey);
	const { error } = await resend.emails.send({
		from: FROM,
		to,
		subject,
		html: body,
	});
	if (error) {
		console.error('Error sending email: ', error);
		throw new Error(`Resend error: ${error.message}`);
	}
	console.debug(`Sent ${subject} to ${to}.`);
}
