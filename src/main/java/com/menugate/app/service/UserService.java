package com.menugate.app.service;

import com.menugate.app.model.User;
import com.menugate.app.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class UserService {

    private static final Set<String> ADMIN_EMAILS = Set.of(
            "binkhalidabdullahv@gmail.com",
            "ibra7bi@gmail.com"
    );

    private final UserRepository userRepository;

    @Transactional
    public User findOrCreateUser(String email, String name) {
        return userRepository.findByEmail(email)
                .map(existingUser -> {
                    existingUser.setName(name);
                    return userRepository.save(existingUser);
                })
                .orElseGet(() -> {
                    User newUser = User.builder()
                            .email(email)
                            .name(name)
                            .createdAt(LocalDateTime.now())
                            .isAdmin(ADMIN_EMAILS.contains(email.toLowerCase()))
                            .build();
                    return userRepository.save(newUser);
                });
    }
}
