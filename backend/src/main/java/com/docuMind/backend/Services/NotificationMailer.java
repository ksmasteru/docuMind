package com.docuMind.backend.services;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import com.docuMind.backend.model.Notification;

// The notifications by e-mail. Off until an SMTP account is set in .env (SPRING_MAIL_HOST, _PORT,
// _USERNAME, _PASSWORD, SERVER_SETUP.md): Spring Boot only creates the JavaMailSender once
// spring.mail.host is set, and without it nothing is sent. The bell works either way.
// Sent in the background (mailExecutor, AsyncConfig): a slow or refused SMTP server never holds up
// the action, and a failed e-mail is only logged.
@Component
public class NotificationMailer {
    private static final Logger log = LoggerFactory.getLogger(NotificationMailer.class);

    private final ObjectProvider<JavaMailSender> sender;
    // Spring Boot creates the sender as soon as spring.mail.host exists, even blank: blank is off here
    private final boolean configured;
    private final String from;
    // the app's address, for the link at the bottom of the e-mail; blank: no link
    private final String appUrl;

    public NotificationMailer(ObjectProvider<JavaMailSender> sender,
                              @Value("${spring.mail.host:}") String host,
                              @Value("${app.mail.from:}") String from,
                              @Value("${spring.mail.username:}") String username,
                              @Value("${app.cors.frontend-url:}") String appUrl)
    {
        this.sender = sender;
        this.configured = !host.isBlank();
        this.from = !from.isBlank() ? from : username;
        this.appUrl = appUrl.replaceAll("/+$", "");
    }

    @Async("mailExecutor")
    public void send(List<Notification> notifications)
    {
        JavaMailSender mail = configured ? sender.getIfAvailable() : null;
        if (mail == null)
            return;
        for (Notification n : notifications)
        {
            try {
                mail.send(message(n));
            }
            catch (MailException e) {
                log.warn("notification e-mail to {} not sent: {}", n.getRecipientEmail(), e.getMessage());
            }
        }
    }

    SimpleMailMessage message(Notification n)
    {
        SimpleMailMessage message = new SimpleMailMessage();
        if (!from.isBlank())
            message.setFrom(from);
        message.setTo(n.getRecipientEmail());
        message.setSubject("GreenSense 4.0 · " + n.getTitle());
        StringBuilder text = new StringBuilder(n.getTitle());
        if (n.getBody() != null)
            text.append("\n\n").append(n.getBody());
        if (n.getLink() != null && !appUrl.isBlank())
            text.append("\n\nOuvrir : ").append(appUrl).append(n.getLink());
        text.append("\n\n—\nMessage envoyé par GreenSense 4.0 (PHOVA). Vos notifications sont aussi dans l'application, sous la cloche.");
        message.setText(text.toString());
        return message;
    }
}
