import { Resend } from 'resend';

export async function sendEmail(apiKey: string, from: string, to: string, subject: string, body: string): Promise<void> {
	const resend = new Resend(apiKey);
	const { error } = await resend.emails.send({
		from,
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
