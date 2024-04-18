#pragma once

#include <Structs/ActionEvent.h>
#include "RandomServices.h"

struct ActorExtension
{
    enum
    {
        kRemote = 1 << 0,
        kPlayer = 1 << 1,
    };

    bool IsRemote() const noexcept;
    bool IsLocal() const noexcept;
    bool IsPlayer() const noexcept;
    bool IsRemotePlayer() const noexcept;
    bool IsLocalPlayer() const noexcept;
    void SetRemote(bool aSet) noexcept;
    void SetPlayer(bool aSet) noexcept;

    ActionEvent LatestAnimation{};
    size_t GraphDescriptorHash = 0;

    // To help resolve fights over inventory.
    std::optional<RandomServices::clock::time_point> ActorClaimedDeadline;

private:
    uint32_t onlineFlags{0};
};
