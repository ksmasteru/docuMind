// A notification asked for from inside a transaction (the stock's low-stock warning, StockService):
// published as an event, NotificationService writes it once the transaction commits, so an action
// that is refused and rolled back never notifies anyone. To one person (email) or to every user of
// a role (role); exceptEmail: who did it, never notified of his own action.
package com.docuMind.backend.model;

import com.docuMind.backend.model.enums.NotificationKind;
import com.docuMind.backend.model.enums.UserRole;

public record NotificationRequest(String email, UserRole role, NotificationKind kind, String title, String body,
                                  String link, String exceptEmail)
{
    public static NotificationRequest toRole(UserRole role, NotificationKind kind, String title, String body,
                                             String link, String exceptEmail)
    {
        return new NotificationRequest(null, role, kind, title, body, link, exceptEmail);
    }
}
